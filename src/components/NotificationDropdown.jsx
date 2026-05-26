import React, { useState, useEffect } from "react";
import { useAppData } from "../context/AppDataProvider";

export default function NotificationDropdown() {
  const { userId } = useAppData(); 
  const [isOpen, setIsOpen] = useState(false);
  const [localNotifications, setLocalNotifications] = useState([]); // 프론트에서 관리하는 알림함

  useEffect(() => {
    // 🔔 [핵심 이벤트 리스너] 
    // 추천 페이지에서 "새 추천 공모전 생겼다!"라고 이벤트를 쏴주면 그걸 낚아챕니다.
    const handleNewRecommendation = (event) => {
      const { title, contestTitle } = event.detail;
      
      const newAlert = {
        id: Date.now(), // 고유 ID
        title: title || "✦ AI 맞춤 추천 공모전 업데이트!",
        message: `회원님을 위한 최신 추천 공모전이 도착했습니다:\n'${contestTitle}'`,
        is_read: false,
        created_at: new Date().toISOString()
      };

      // 기존 알림 리스트 맨 앞에 새 알림 추가
      setLocalNotifications(prev => [newAlert, ...prev]);
    };

    // 이벤트를 들을 수 있도록 등록
    window.addEventListener("NEW_AI_RECOMMENDATION", handleNewRecommendation);
    
    return () => {
      window.removeEventListener("NEW_AI_RECOMMENDATION", handleNewRecommendation);
    };
  }, []);

  // 읽지 않은 최신 알림 개수 계산
  const unreadCount = localNotifications.filter((n) => !n.is_read).length;

  // 알림 클릭 시 읽음 처리
  const markAsReadLocal = (id) => {
    setLocalNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
  };

  if (!userId) return null;

  return (
    <div className="relative inline-block text-left">
      {/* 🔔 알림 진입 종 아이콘 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-indigo-600 focus:outline-none transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* 📂 알림 오버레이 카드 드롭다운 패널 */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
            <div className="p-4 border-b border-gray-50 bg-gray-50/70 font-bold text-sm text-gray-800 flex justify-between items-center">
              <span>알림 소식</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                  신규 {unreadCount}개
                </span>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto">
              {localNotifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">도착한 맞춤 알림이 없습니다.</div>
              ) : (
                localNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => markAsReadLocal(notif.id)}
                    className={`p-4 border-b border-gray-50 cursor-pointer transition-colors text-left ${
                      notif.is_read ? "bg-white hover:bg-gray-50" : "bg-indigo-50/30 hover:bg-indigo-50/70"
                    }`}
                  >
                    <div className="flex items-start gap-1">
                      {!notif.is_read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />}
                      <p className={`text-xs font-semibold ${notif.is_read ? "text-gray-500" : "text-gray-900"}`}>
                        {notif.title}
                      </p>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 pl-2.5 whitespace-pre-line leading-relaxed">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-2 pl-2.5">
                      방금 전
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
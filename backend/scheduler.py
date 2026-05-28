from __future__ import annotations

import time

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from database import SessionLocal
from main import initialize_application_data, run_crawl_pipeline


SCHEDULE_HOUR = 3
SCHEDULE_MINUTE = 0


def scheduled_crawl_job() -> None:
    db = SessionLocal()
    try:
        result = run_crawl_pipeline(db)
        print(f"[ConQuest Scheduler] {result['message']}")
    finally:
        db.close()


def main() -> None:
    initialize_application_data()
    scheduler = BlockingScheduler(timezone="Asia/Seoul")
    scheduler.add_job(
        scheduled_crawl_job,
        CronTrigger(hour=SCHEDULE_HOUR, minute=SCHEDULE_MINUTE),
        id="conquest_daily_crawl",
        replace_existing=True,
    )

    print(f"[ConQuest Scheduler] 매일 {SCHEDULE_HOUR:02d}:{SCHEDULE_MINUTE:02d} 자동 크롤링이 실행됩니다.")
    print("[ConQuest Scheduler] 종료하려면 Ctrl+C를 누르세요.")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("[ConQuest Scheduler] 종료합니다.")
        time.sleep(0.1)


if __name__ == "__main__":
    main()

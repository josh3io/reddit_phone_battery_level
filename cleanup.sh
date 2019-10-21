
find /home/josh/reddit_phone_battery_level/images -type f -mmin +10 -delete 2>&1 >> logs/phonebatterylevelbot.cleanup.log
find /home/josh/reddit_phone_battery_level/tmp -type f -mmin +10 -delete 2>&1 >> logs/phonebatterylevelbot.cleanup.log


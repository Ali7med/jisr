#!/bin/sh
# نسخة احتياطية يومية بـ pg_dump مع تدوير.
#
# **النسخة التي لم تُستعَد مرة ليست نسخة احتياطية** — تمرين الاستعادة
# ربع السنوي إلزامي وموثّق في docs/runbook.md (P2.7).
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p /backups

while true; do
	STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
	TARGET="/backups/jisr-${STAMP}.sql.gz"

	if pg_dump --no-owner --no-privileges | gzip >"${TARGET}.partial"; then
		# التسمية النهائية بعد النجاح: ملف نصف مكتوب لا يبدو نسخة صالحة
		mv "${TARGET}.partial" "${TARGET}"
		echo "[backup] ✅ ${TARGET} ($(du -h "${TARGET}" | cut -f1))"
		find /backups -name 'jisr-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete
	else
		rm -f "${TARGET}.partial"
		echo "[backup] ❌ فشلت النسخة الاحتياطية في ${STAMP}" >&2
	fi

	sleep "${INTERVAL_SECONDS}"
done

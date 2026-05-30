#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/data/blog-backend"
BACKUP_DIR="$APP_DIR/backups"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/$TS"

set -a
source "$APP_DIR/.env"
set +a
source /opt/1panel/apps/mysql/mysql/.env
MYSQL_ROOT_PASSWORD="$PANEL_DB_ROOT_PASSWORD"

docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" 1Panel-mysql-Bv5t mysqldump -h127.0.0.1 -uroot --single-transaction --routines --triggers "$DB_NAME" > "$BACKUP_DIR/$TS/mysql.sql"
tar -C "$APP_DIR" -czf "$BACKUP_DIR/$TS/uploads.tar.gz" uploads
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "$BACKUP_DIR/$TS"

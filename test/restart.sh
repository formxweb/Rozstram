#!/bin/bash
# Test veritabanını sıfırlar ve test sunucusunu yeniden başlatır
cd "$(dirname "$0")/.."
export PGHOST=/var/tmp/rozpg PGPORT=5433 PGUSER=postgres
[ -f /var/tmp/rozserver.pid ] && kill "$(cat /var/tmp/rozserver.pid)" 2>/dev/null
sleep 0.4
psql -q -c "drop database if exists roz;" -c "create database roz;" >/dev/null 2>&1
psql -d roz -q -f supabase/test/supabase_mock.sql >/dev/null 2>&1
psql -d roz -q -v ON_ERROR_STOP=1 -f supabase/schema.sql >/dev/null 2>/var/tmp/schema.err || { cat /var/tmp/schema.err; exit 1; }
rm -rf /var/tmp/rozstore && mkdir -p /var/tmp/rozstore
NODE_PATH=/opt/npm-tools/node_modules setsid node test/server.js > /var/tmp/rozserver.log 2>&1 < /dev/null &
echo $! > /var/tmp/rozserver.pid
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 0.5; curl -s -o /dev/null http://127.0.0.1:8787/ && break; done
cat /var/tmp/rozserver.log

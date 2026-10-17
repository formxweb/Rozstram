#!/bin/bash
# Yerel Postgres'te şemayı sıfırdan kurup testleri çalıştırır
export PGHOST=/var/tmp/rozpg PGPORT=5433 PGUSER=postgres
cd "$(dirname "$0")/.."
psql -q -c "drop database if exists roz;" -c "create database roz;" >/dev/null 2>&1
psql -d roz -q -f test/supabase_mock.sql >/dev/null 2>&1
psql -d roz -q -v ON_ERROR_STOP=1 -f schema.sql >/dev/null 2>schema.err || { cat schema.err; exit 1; }
psql -d roz -q -t -A -f test/test.sql 2>&1 | grep -E "ok:|FAIL|ERROR|==" | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  //'

import os
from pathlib import Path

import pymysql
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parents[2]
load_dotenv(backend_dir / ".env")

try:
    connection = pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        connect_timeout=5,
    )

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT DATABASE(), VERSION()")
            database, version = cursor.fetchone()
            print(f"Connected to database: {database}")
            print(f"MariaDB version: {version}")
    finally:
        connection.close()

except Exception as error:
    print(f"Database connection failed: {error}")
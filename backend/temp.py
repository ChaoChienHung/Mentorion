import sqlite3

conn = sqlite3.connect("backend/data/app.db")
cursor = conn.cursor()

cursor.execute("SELECT * FROM items;")
print(cursor.fetchall())

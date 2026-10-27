"""Manage web app users (stored in data/users.json).

    python manage_users.py add <username> ["Nama Lengkap"]   # asks for a password
    python manage_users.py passwd <username>
    python manage_users.py remove <username>
    python manage_users.py list
"""
import getpass
import sys

import auth


def ask_password():
    while True:
        p1 = getpass.getpass("Password (min 8 karakter): ")
        p2 = getpass.getpass("Ulangi password: ")
        if p1 != p2:
            print("Password tidak sama, coba lagi.")
        elif len(p1) < 8:
            print("Password minimal 8 karakter.")
        else:
            return p1


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    cmd = argv[1]
    if cmd == "list":
        users = auth.list_users()
        if not users:
            print("(belum ada user)")
        for name, u in users.items():
            print(f"{name:20} {u['fullname']}")
    elif cmd in ("add", "passwd") and len(argv) >= 3:
        name = argv[2]
        if cmd == "passwd" and name not in auth.list_users():
            sys.exit(f"User '{name}' tidak ada.")
        auth.set_password(name, ask_password(), argv[3] if len(argv) > 3 else None)
        print(f"User '{name}' disimpan.")
    elif cmd == "remove" and len(argv) >= 3:
        auth.remove(argv[2])
        print(f"User '{argv[2]}' dihapus.")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)

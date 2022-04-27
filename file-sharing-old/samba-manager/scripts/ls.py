#!/usr/bin/env python3

"""
    Cockpit Navigator - A File System Browser for Cockpit.
    Copyright (C) 2021 Josh Boudreau <jboudreau@45drives.com>

    This file is part of Cockpit Navigator.
    Cockpit Navigator is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    Cockpit Navigator is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with Cockpit Navigator.  If not, see <https://www.gnu.org/licenses/>.
"""

import os
from stat import S_ISDIR, S_ISLNK, filemode
import json
import sys
from pwd import getpwuid
from grp import getgrgid

def get_stat(full_path, filename = '/'):
    stats = os.lstat(full_path)
    isdir = False
    try:
        isdir = S_ISDIR(os.stat(full_path).st_mode)
    except OSError:
        pass
    response = {
        "filename": filename,
        "isdir": isdir,
    }
    return response

def main():
    if(len(sys.argv) < 2):
        sys.exit(1)
    try:
        nodes = os.listdir(sys.argv[1])
    except Exception as e:
        print(e)
        sys.exit(1)
    response = {
        ".": get_stat(sys.argv[1]),
        "children": []
    }
    for node in nodes:
        full_path = sys.argv[1] + "/" + node
        response["children"].append(get_stat(full_path, node))
    print(json.dumps(response))


if __name__ == "__main__":
    main()

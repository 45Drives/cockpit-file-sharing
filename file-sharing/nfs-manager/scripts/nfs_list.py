#!/usr/bin/env python3

""" 
    Cockpit File Sharing - Cockpit plugin for managing file shares.
    Copyright (C) 2021 Sam Silver <ssilver@45drives.com>

    This file is part of Cockpit File Sharing.
    Cockpit File Sharing is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    Cockpit File Sharing is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with Cockpit File Sharing.  If not, see <https://www.gnu.org/licenses/>.  
"""

import re
import sys
import json

# Name: check_config
# Receives: Nothing
# Does: Checks in /etc/exports exists/ is in correct format.
# Returns: Nothing
def check_config():
    try:
        file = open("/etc/exports", "r")
        lines = file.readlines()
        file.close()
    except OSError:
        print("Could not open /etc/exports. Do you have nfs installed?")
        sys.exit(1)
    
    if len(lines) == 0 or lines[0] != "# Formmated for cockpit-nfs-manager\n":
        file = open("/etc/exports", "w")
        file.write("# Formmated for cockpit-nfs-manager\n")
        file.close()

# Name: main
# Receives: nothing
# Does: Opens /etc/exports and parses the files for inputted exports. prints as JSON
# Returns: Nothing
def main():
    check_config()
    obj = []
    try:
        file = open("/etc/exports", "r")
        lines = file.readlines()
        file.close()
        for i in range(0, len(lines), 1):
            if("Name:" in lines[i]):
                name = lines[i][8:-1]
                i += 1
                fields = re.findall(r"^([^\s]+)\s([^\s]+)\(([^\(]+)\)$", lines[i], re.MULTILINE)
                path = fields[0][0]
                ip = fields[0][1]
                permissions = fields[0][2]
                dic = {"Name":name, "Path":path, "IP":ip, "Permissions":permissions}
                obj.append(dic)
    except OSError:
        print(OSError)
        sys.exit(1)
    
    obj = json.dumps(obj)
    print(obj)

if __name__ == "__main__":
    main()
    sys.exit(0)
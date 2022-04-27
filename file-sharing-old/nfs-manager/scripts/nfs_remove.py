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

import sys
import subprocess
from optparse import OptionParser
import re

# Name: check_config
# Receives: Nothing
# Does: Checks in /etc/exports.d/cockpit-file-sharing.exports exists / is in correct format.
# Returns: Nothing
def check_config():
    try:
        file = open("/etc/exports.d/cockpit-file-sharing.exports", "r")
        lines = file.readlines()
        file.close()
    except OSError:
        print("Could not open /etc/exports.d/cockpit-file-sharing.exports. Do you have nfs installed?")
        sys.exit(3)
    
    if len(lines) == 0 or lines[0] != "# Formmated by cockpit-file-sharing\n":
        print("Please run nfs_list.py for setup.")
        sys.exit(1)

# Name: reset_config
# Receives: Nothing
# Does: Export new shared directory as well as restart the nfs system.
# Returns: Nothing
def reset_config():
    try:
        subprocess.run(["exportfs", "-ra"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("Restarting nfs...")
    except OSError:
        print("Could not restart nfs, do you have it on your system?")
        sys.exit(4)

# Remove the whole export line
def remove_export(name):
    try:
        name_exist = False
        file = open("/etc/exports.d/cockpit-file-sharing.exports", "r")
        lines = file.readlines()
        file.close()
        for i in range(0, len(lines), 1):
            if(("Name: " + name) in lines[i]):
                lines.pop(i)
                lines.pop(i)
                lines.pop(i)
                name_exist = True
                break
                  
        if name_exist:
            print("Rewriting exports...")
            file = open("/etc/exports.d/cockpit-file-sharing.exports", "w")
            file.write("".join(lines))
            file.close()
            reset_config()
        else:
            print("That NFS Name does not exist.")
            sys.exit(5)

    except OSError:
        print(OSError)
        sys.exit(1) 

# Name: main
# Receives: nothing
# Does: Checks all the arguments and flags. Makes sure the user entered enough
# arguments. Chucks arguments into make_nfs function
# Returns: Nothing
def main():
    check_config()
    parser = OptionParser()
    (options, args) = parser.parse_args()
    remove_export(args[0])


if __name__ == "__main__":
    main()
    sys.exit(0)
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
        print("Please run nfs_list.py for setup.")
        sys.exit(1)

# Name: reset_config
# Receives: Nothing
# Does: Export new shared directory as well as restart the nfs system.
# Returns: Nothing
def reset_config():
    try:
        subprocess.run(["exportfs", "-a"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("Exporting new share permissions...")
    except OSError:
        print("Could not exportfs -a. Error: " + OSError)
        sys.exit(1)
    try:
        subprocess.run(["systemctl", "restart", "nfs-kernel-system"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("Restarting nfs-kernel-system...")
    except OSError:
        print("Could not restart nfs-kernel-system, do you have it on your system?")
        sys.exit(1)

# Name: remove_nfs
# Receives: Name and del_dir
# Does: Parses /etc/exports for the names of NFS(s) to be deleted, remove them from list.
# Then rewrite /etc/exports with new file. Delete directroy if flagged.
# Returns: Nothing
def remove_nfs(name):
    try:
        does_exist = False
        file = open("/etc/exports", "r")
        lines = file.readlines()
        file.close()
        for i in range(0, len(lines), 1):
            if("Name:" in lines[i]):
                if(name + "\n" in lines[i]):
                    print("Removing: " + lines[i])
                    lines.remove(lines[i])
                    print("Removing: " + lines[i])
                    lines.remove(lines[i])
                    does_exist = True
                    break
        
        if does_exist:
            print("Rewriting exports...")
            file = open("/etc/exports", "w")
            file.write("".join(lines))
            file.close()
            reset_config()
        else:
            print("That NFS does not exist.")
            sys.exit(1)

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
    if len(args) < 1:
        print("Not enough arguments!\nnfs_remove <name>")
        sys.exit(1)
    remove_nfs(args[0])


if __name__ == "__main__":
    main()
    sys.exit(0)
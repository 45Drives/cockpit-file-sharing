#!/usr/bin/env python3

"""
	Cockpit Samba Manager - Cockpit plugin for managing Samba.
	Copyright (C) 2021 Sam Silver <ssilver@45drives.com>

	This file is part of Cockpit Samba Manager.
	Cockpit Samba Manager is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	Cockpit Samba Manager is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.
	You should have received a copy of the GNU General Public License
	along with Cockpit Samba Manager.  If not, see <https://www.gnu.org/licenses/>.
"""

import sys
import subprocess

def main():
    if(len(sys.argv) < 4):
        sys.exit(1)
    try:
        subprocess.run(["net", "sam", "rights", "grant", sys.argv[1], "SeDiskOperatorPrivilege", "-U", sys.argv[2]+"%"+sys.argv[3]])
    except Exception as e:
        print(e)
        sys.exit(1)


if __name__ == "__main__":
    main()
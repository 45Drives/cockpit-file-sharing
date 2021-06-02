# Cockpit File Sharing - Cockpit plugin for managing file shares.
# Copyright (C) 2021 Sam Silver <ssilver@45drives.com>

# This file is part of Cockpit File Sharing.
# Cockpit File Sharing is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# Cockpit File Sharing is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# You should have received a copy of the GNU General Public License
# along with Cockpit File Sharing.  If not, see <https://www.gnu.org/licenses/>.

all: default

install:
	mkdir -p $(DESTDIR)/usr/share/cockpit/
	cp -rpf file-sharing $(DESTDIR)/usr/share/cockpit

uninstall:
	rm -rf $(DESTDIR)/usr/share/cockpit/file-sharing

install-local:
	mkdir -p $(HOME)/.local/share/cockpit
	cp -rpf file-sharing $(HOME)/.local/share/cockpit
	sed -i "s#\"/usr/share/\(cockpit/file-sharing/samba-manager/scripts/.*\)\"#\"$(HOME)/.local/share/\1\"#g" $(HOME)/.local/share/cockpit/file-sharing/samba-manager/samba-manager.js
	sed -i "s#\"/usr/share/\(cockpit/file-sharing/nfs-manager/scripts/.*\)\"#\"$(HOME)/.local/share/\1\"#g" $(HOME)/.local/share/cockpit/file-sharing/nfs-manager/nfs-manager.js

make uninstall-local:
	rm -rf $(HOME)/.local/share/cockpit/file-sharing
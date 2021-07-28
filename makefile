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
default:

target=file-sharing

all:


# system install, requires `systemctl restart cockpit.socket`
install:
	mkdir -p $(DESTDIR)/usr/share/cockpit
	cp -rpf $(target) $(DESTDIR)/usr/share/cockpit

# install to ~/.local, can test plugin without restarting cockpit
install-local:
	mkdir -p $(HOME)/.local/share/cockpit
	cp -rpf $(target) $(HOME)/.local/share/cockpit
	find $(HOME)/.local/share/cockpit/$(target)/nfs-manager -name '*.js' -exec sed -i "s#\"/usr/share/\(cockpit/$(target)/nfs-manager/scripts/.*\)\"#\"$(HOME)/.local/share/\1\"#g" {} \;
	find $(HOME)/.local/share/cockpit/$(target)/samba-manager -name '*.js' -exec sed -i "s#\"/usr/share/\(cockpit/$(target)/samba-manager/scripts/.*\)\"#\"$(HOME)/.local/share/\1\"#g" {} \;
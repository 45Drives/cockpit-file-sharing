#!/usr/bin/env bash

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

PACKAGE_NAME=cockpit-file-sharing

# check that docker is installed
command -v docker > /dev/null 2>&1 || {
	echo "Please install docker.";
	exit 1;
}

# if docker image DNE, build it (keep container tag name unique to software package)
if [[ "$(docker images -q $PACKAGE_NAME-ubuntu-builder 2> /dev/null)" == "" ]]; then
	docker build -t $PACKAGE_NAME-ubuntu-builder - < docker/ubuntu # pass in path to docker file
	res=$?
	if [ $res -ne 0 ]; then
		echo "Building docker image failed."
		exit $res
	fi
fi

make clean

mkdir -p dist/ubuntu

# mirror current directory to working directory in container, and mirror dist/ubuntu to .. for deb output
docker run -u $(id -u):$(id -g) -w /home/deb/build -it -v$(pwd):/home/deb/build -v$(pwd)/dist/ubuntu:/home/deb --rm $PACKAGE_NAME-ubuntu-builder dpkg-buildpackage -us -uc -b
res=$?
if [ $res -ne 0 ]; then
	echo "Packaging failed."
	exit $res
fi

rmdir dist/ubuntu/build

echo "deb is in dist/ubuntu/"

exit 0
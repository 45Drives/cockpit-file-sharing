# Automatic Houston Plugin Makefile
# Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>
# 
# Automatic Houston Plugin Makefile is free software: you can redistribute it and/or modify it under the terms
# of the GNU General Public License as published by the Free Software Foundation, either version 3
# of the License, or (at your option) any later version.
# 
# Automatic Houston Plugin Makefile is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
# without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
# 
# You should have received a copy of the GNU General Public License along with Automatic Houston Plugin Makefile.
# If not, see <https://www.gnu.org/licenses/>. 

# PLUGIN_SRCS is space-delimited list of subdirectories containg a plugin project.
PLUGIN_SRCS=file-sharing

# For installing to a remote machine for testing with `make install-remote`
# REMOTE_TEST_HOST=192.168.206.100
REMOTE_TEST_HOST=192.168.85.64
REMOTE_TEST_USER=root

# Restarts cockpit after install
RESTART_COCKPIT?=0

# When set to 1, JS is not minified
DEBUG?=0

# Run yarn upgrade or npm update for each project before build
AUTO_UPGRADE_DEPS?=0

# USAGE
# installation:
# $ make
# # make install
# testing:
# $ make
# $ make install-local
# or
# $ make install-remote
################################
# Do not edit anything below

define greentext
	'\033[1;32m$(1)\033[0m'
endef
define cyantext
	'\033[1;96m$(1)\033[0m'
endef

ifeq ($(DEBUG),1)
BUILD_FLAGS=-- --minify false
endif

ifndef PLUGIN_SRCS
# PLUGIN_SRCS:=$(filter-out %-old houston-common, $(patsubst %/package.json,%,$(wildcard */package.json)))
$(error PLUGIN_SRCS not set - please edit Makefile)
endif

OUTPUTS:=$(addsuffix /dist/index.html, $(PLUGIN_SRCS))

NPM_PREFIX:=$(shell command -v yarn > /dev/null 2>&1 && echo 'yarn --cwd' || echo 'npm --prefix')
NPM_UPDATE:=$(shell command -v yarn > /dev/null 2>&1 && echo 'yarn upgrade --cwd' || echo 'npm update --prefix')

default: $(OUTPUTS)

all: default

.PHONY: default all install clean help install-local install-remote install houston-common bootstrap-yarn

bootstrap-yarn: .yarnrc.yml

.yarnrc.yml:
	./bootstrap.sh

houston-common/Makefile:
	git submodule update --init

houston-common: houston-common/Makefile bootstrap-yarn
	$(MAKE) -C houston-common

houston-common-%:
	$(MAKE) -C houston-common $*

# build outputs
.SECONDEXPANSION:
$(OUTPUTS): %/dist/index.html: bootstrap-yarn houston-common $$(shell find '$$*' -type d \( -name node_modules -o -path '$$*/dist' -o -path '*node_modules*'  \) -prune -o -type f -not \( -name .gitignore \) -print)
	@echo -e $(call cyantext,Building $*)
	yarn --cwd $* install
ifeq ($(AUTO_UPGRADE_DEPS),1)
	yarn upgrade --cwd $*
endif
	yarn --cwd $* run build $(BUILD_FLAGS)
	@echo -e $(call greentext,Done building $*)
	@echo

# system install, requires `systemctl restart cockpit.socket`
# runs plugin-install-* for each plugin
.SECONDEXPANSION:
install install-local install-remote: $$(OUTPUTS) $$(addprefix plugin-$$@-, $$(PLUGIN_SRCS)) system-files-$$@
ifeq ($(RESTART_COCKPIT), 1)
ifndef DESTDIR
	$(SSH) systemctl stop cockpit.socket
	$(SSH) systemctl start cockpit.socket
endif
endif

install-remote : SSH=ssh $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST)

plugin-install-% plugin-install-local-% plugin-install-remote-%:
	@echo -e $(call cyantext,Installing $*)
	@echo Creating install directory
	$(SSH) mkdir -p $(DESTDIR)$(INSTALL_PREFIX)/$*$(INSTALL_SUFFIX)
	@echo
	@echo Copying files
	@test -z "$(SSH)" && \
		cp -af $*/dist/* $(DESTDIR)$(INSTALL_PREFIX)/$*$(INSTALL_SUFFIX) || \
		rsync -avh $*/dist/* $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST):$(DESTDIR)$(INSTALL_PREFIX)/$*$(INSTALL_SUFFIX)
	@echo -e $(call greentext,Done installing $*)
	@echo

plugin-install-% : INSTALL_PREFIX?=/usr/share/cockpit

plugin-install-local-% : INSTALL_PREFIX=$(HOME)/.local/share/cockpit
plugin-install-local-% : INSTALL_SUFFIX=-test

plugin-install-remote-% : INSTALL_PREFIX=$(REMOTE_TEST_HOME)/.local/share/cockpit
plugin-install-remote-% : INSTALL_SUFFIX=-test
plugin-install-remote-% : SSH=ssh $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST)
plugin-install-remote-% : REMOTE_TEST_HOME=$(shell ssh $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST) 'echo $$HOME')

system-files-install:
	-cp -af system_files/* $(DESTDIR)/

system-files-install-local:
	-cp -af system_files/* $(DESTDIR)/

system-files-install-remote:
	-rsync -avh system_files/* $(REMOTE_TEST_USER)@$(REMOTE_TEST_HOST):$(DESTDIR)/

package-generic: default
	PKG_NAME="$$(jq -r '[ .name, .version ] | join("_")' ./manifest.json)"'_generic' && \
	rm -f "$${PKG_NAME}.{zip,tar.gz}" && \
	ln -snf . "$${PKG_NAME}" && \
	readarray -t FILES < <(find -H "$${PKG_NAME}" -type d \( -name 'src' -o -name 'node_modules' \) -prune -o -type f \( -path '*/dist/*' -o -path '*/system_files/*' -o -name package.json -o -iname 'makefile' -o -iname 'licen[sc]e' -o -iname 'readme.md' -o -name 'manifest.json' \) -print) && \
	zip -q "$${PKG_NAME}.zip" "$${FILES[@]}" && \
	tar -czf "$${PKG_NAME}.tar.gz" "$${FILES[@]}" && \
	rm "$${PKG_NAME}"

clean: FORCE houston-common-clean
	rm $(dir $(OUTPUTS)) -rf

clean-all: clean FORCE
	rm .yarnrc.yml .yarn/ -rf
	find . -name node_modules -type d -exec rm -rf {} \; -prune

help:
	@echo 'make usage'
	@echo
	@echo 'building:'
	@echo '    make'
	@echo
	@echo 'installation:'
	@echo '    make install [RESTART_COCKPIT=1]' 
	@echo
	@echo 'testing:'
	@echo '    make install-local [RESTART_COCKPIT=1]'
	@echo 'or'
	@echo '    make install-remote [RESTART_COCKPIT=1]'
	@echo
	@echo 'build cleanup:'
	@echo '    make clean'

# test-%:
# 	yarn --cwd $* run test

# test: houston-common-test

FORCE:

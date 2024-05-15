/* Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>
 * 
 * This file is part of 45Drives NPM Repository.
 * 
 * 45Drives NPM Repository is free software: you can redistribute it and/or modify it under the terms
 * of the GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 * 
 * 45Drives NPM Repository is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License along with 45Drives NPM Repository.
 * If not, see <https://www.gnu.org/licenses/>. 
 */

/**
 * @typedef {Object} NfsExportObj
 * @alias NfsExportObj
 * @memberof module:cockpit-syntaxes
 * @property {String} path - Path of share
 * @property {NfsExportClientObj[]} clients
 */

/**
 * @typedef {Object} NfsExportClientObj
 * @alias NfsExportObj
 * @memberof module:cockpit-syntaxes
 * @property {String} host - Host pattern
 * @property {String} settings - Settings for host
 */

/**
 * @namespace {Object} NfsExportSyntax
 * @memberof module:cockpit-syntaxes
 * @alias NfsExportSyntax
 * @description
 * Syntax object for parsing/stringifying /etc/exports
 */
export const NfsExportSyntax = {
    /**
     * Parse text content of /etc/exports into array of objects
     * @memberof NfsExportSyntax
     * @method
     * @param {String} confText 
     * @returns {NfsExportObj[]}
     */
    parse: (confText) => {
        if (!confText)
            return [];
        return confText.split('\n')
            .map((line) => {
                if (/^\s*#/.test(line) || /^\s*$/.test(line))
                    return null; // skip comments and empty lines
                const pathMatch = line.match(/^("[^"]+"|[^\s]+)\s+(.*)$/);
                if (!pathMatch)
                    return null;
                const [_, pathMaybeQuoted, clientsStr] = pathMatch;
                const path = pathMaybeQuoted.replace(/^"|"$/g, '');
                const clientsMatch = clientsStr.match(/[^\t \(]+(?:\([^\)]+\))?/g);
                if (!clientsMatch)
                    return null;
                const clients = clientsMatch
                    .map((clientStr) => {
                        const match = clientStr.match(/^([^\(]+)(?:\(([^\)]+)\))?/);
                        if (!match)
                            return null;
                        const [_, host, settings] = match;
                        return {
                            host,
                            settings: settings ?? ""
                        };
                    })
                    .filter(client => client);
                return { path, clients };
            })
            .filter(share => share);
    },
    /**
     * Convert array of shares to text for /etc/exports
     * @memberof NfsExportSyntax
     * @method
     * @param {NfsExportObj[]} shares 
     * @returns {String}
     */
    stringify: (shares) => {
        let output = "# managed by cockpit-file-sharing\n# do not modify\n";
        for (const share of shares) {
            output += `"${share.path}"`;
            for (const client of share.clients) {
                output += ` ${client.host}(${client.settings})`;
            }
            output += '\n';
        }
        return output;
    }
};

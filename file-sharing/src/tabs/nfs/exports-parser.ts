import { ParsingError, RegexSnippets, type SyntaxParser } from "@45drives/houston-common-lib";
import type {
  NFSExport,
  NFSExportClient,
  NFSClientOptions,
  INFSClientOptionCtor,
  INFSClientOption,
} from "@/tabs/nfs/data-types";
import {
  defaultNFSExport,
  defaultNFSClientOptions,
  NFSClientOptionsCtors,
} from "@/tabs/nfs/data-types";
import { Result, ok, err, safeTry } from "neverthrow";
import { Maybe, Some, None } from "monet";

export class NFSClientOptionsParser implements SyntaxParser<NFSClientOptions> {
  private static ctors = Object.entries(NFSClientOptionsCtors);
  private hideAllDefaults: boolean;

  constructor(hideAllDefaults: boolean = false) {
    this.hideAllDefaults = hideAllDefaults;
  }

  apply(optionsString: string) {
    return optionsString.split(",").reduce<Result<NFSClientOptions, ParsingError>>(
      (options, token) =>
        options.andThen((options) => {
          for (const [key, Option] of NFSClientOptionsParser.ctors) {
            const nextOptions = Option.fromString(token).map((option) => ({
              ...options,
              [key]: option,
            }));
            if (nextOptions.isSome()) {
              return ok(nextOptions.some());
            }
          }
          return err(new ParsingError(`NFSClientOptionsParser: No match for token: ${token}`));
        }),
      ok(defaultNFSClientOptions())
    );
  }
  unapply(options: NFSClientOptions) {
    const hideAllDefaults = this.hideAllDefaults;
    return ok(
      Object.values(options)
        .map((option) => option.configValue(hideAllDefaults).orNull())
        .filter((o): o is string => o !== null)
        .join(",")
    );
  }
}

export class NFSClientsParser implements SyntaxParser<NFSExportClient[]> {
  private clientOptionsParser: SyntaxParser<NFSClientOptions>;
  constructor() {
    this.clientOptionsParser = new NFSClientOptionsParser();
  }

  apply(clientString: string) {
    const clientMatches = [...clientString.matchAll(/([^ \t\(]+)(?:\(([^\)]+)\))?/g)];
    return Result.combine(
      clientMatches.map(([fullMatch, host, settings]) => {
        if (host === undefined) {
          return err(new ParsingError(`Failed to parse host from ${fullMatch}`));
        }
        return this.clientOptionsParser.apply(settings ?? "").map((settings) => ({
          host,
          settings,
        }));
      })
    );
  }

  unapply(clients: NFSExportClient[]) {
    return Result.combine(
      clients.map((client) =>
        this.clientOptionsParser
          .unapply(client.settings)
          .map((settings) => `${client.host}(${settings})`)
      )
    ).map((clients) => clients.join(" "));
  }
}

export class NFSExportParser implements SyntaxParser<NFSExport> {
  private defaultClientOptionsParser: SyntaxParser<NFSClientOptions>;
  private clientsParser: SyntaxParser<NFSExportClient[]>;
  constructor() {
    this.defaultClientOptionsParser = new NFSClientOptionsParser(true);
    this.clientsParser = new NFSClientsParser();
  }

  apply(unparsed: string): Result<NFSExport, ParsingError> {
    return this.grabRawPath(unparsed)
      .andThen(([rawPath, optionsClientsAndComment]) =>
        this.unescapeRawPath(rawPath).map((path) => {
          return { path, optionsClientsAndComment };
        })
      )
      .andThen(({ path, optionsClientsAndComment }) =>
        this.grabDefaultOptions(optionsClientsAndComment).map(
          ([maybeDefaultOptions, clientsAndComment]) => {
            return {
              path,
              defaultClientSettings: maybeDefaultOptions.orSome(defaultNFSClientOptions()),
              clientsAndComment,
            };
          }
        )
      )
      .map(({ path, defaultClientSettings, clientsAndComment }) => {
        const [comment, clients] = this.grabComment(clientsAndComment);
        return {
          path,
          defaultClientSettings,
          clients,
          comment,
        };
      })
      .andThen(({ path, defaultClientSettings, clients, comment }) =>
        this.clientsParser.apply(clients).map((clients) => ({
          path,
          defaultClientSettings,
          clients,
          comment,
        }))
      );
  }

  unapply(parsed: NFSExport): Result<string, ParsingError> {
    return this.defaultClientOptionsParser
      .unapply(parsed.defaultClientSettings)
      .andThen((defaultClientSettings) =>
        this.clientsParser
          .unapply(parsed.clients)
          .map((clients) => ({ defaultClientSettings, clients }))
      )
      .map(({ defaultClientSettings, clients }) => {
        return [
          /\s/.test(parsed.path) ? `"${parsed.path}"` : parsed.path,
          defaultClientSettings ? `-${defaultClientSettings}` : null,
          clients,
          parsed.comment ? `# ${parsed.comment}` : null,
        ]
          .filter((t): t is string => t !== null)
          .join(" ");
      });
  }

  private grabComment(clientsAndComment: string): [comment: string, clients: string] {
    const [clients, comment] = clientsAndComment.split(/#(.*)/) as [string, ...string[]];
    return [(comment ?? "").trim(), clients];
  }

  private grabRawPath(
    pathOptionsAndClients: string
  ): Result<[rawPath: string, optionsAndClients: string], ParsingError> {
    if (pathOptionsAndClients.startsWith('"')) {
      // quoted path
      const closingQuoteIndex = pathOptionsAndClients.indexOf(pathOptionsAndClients, 1);
      if (closingQuoteIndex === -1) {
        return err(new ParsingError(`Failed to find closing quote: ${pathOptionsAndClients}`));
      }
      return ok([
        pathOptionsAndClients.slice(1, closingQuoteIndex),
        pathOptionsAndClients.slice(closingQuoteIndex + 1).trim(),
      ]);
    }
    const [path, rest] = pathOptionsAndClients.split(/[ \t](.*)/);
    if (path === undefined || rest === undefined) {
      return err(
        new ParsingError(`Failed to split path from options and clients: ${pathOptionsAndClients}`)
      );
    }
    return ok([path, rest.trim()]);
  }

  private unescapeRawPath(rawPath: string): Result<string, ParsingError> {
    try {
      return ok(
        rawPath.replace(/\\\d{3}/, (escapedChar) => {
          const charCode = parseInt(escapedChar.slice(1), 8);
          if (isNaN(charCode)) {
            throw escapedChar;
          }
          return String.fromCharCode(charCode);
        })
      );
    } catch (e) {
      return err(new ParsingError(`Failed to parse escaped path character in ${rawPath}: ${e}`));
    }
  }

  private grabDefaultOptions(
    optionsAndClients: string
  ): Result<[defaultOptions: Maybe<NFSClientOptions>, clients: string], ParsingError> {
    if (!optionsAndClients.startsWith("-")) {
      return ok([None(), optionsAndClients]);
    }
    const [defaultClientOptions, clients] = optionsAndClients.split(/[ \t](.*)/);
    if (defaultClientOptions === undefined || clients === undefined) {
      return err(
        new ParsingError(`Failed to split default options from clients list: ${optionsAndClients}`)
      );
    }
    return this.defaultClientOptionsParser
      .apply(defaultClientOptions.slice(1))
      .map((defaultOptions) => [Some(defaultOptions), clients]);
  }
}

export class NFSExportsParser implements SyntaxParser<NFSExport[]> {
  private nfsExportParser: SyntaxParser<NFSExport>;

  constructor() {
    this.nfsExportParser = new NFSExportParser();
  }

  apply(raw: string) {
    return ok(raw)
      .map((raw) => this.splitRecords(raw))
      .andThen((records) => this.parseRecords(records));
  }

  unapply(exports: NFSExport[]) {
    return Result.combine(exports.map((nfsExport) => this.nfsExportParser.unapply(nfsExport))).map(
      (exports) => exports.join("\n")
    );
  }

  private splitRecords(raw: string): string[] {
    return (
      raw
        // split by newline
        .split(RegexSnippets.newlineSplitter)
        // join escaped newlines
        .reduce<string[]>((lines, line) => {
          const previousLine = lines[lines.length - 1];
          if (previousLine !== undefined && previousLine.endsWith("\\")) {
            return [...lines.slice(0, -1), previousLine.slice(0, -1).concat(" ", line)];
          }
          return [...lines, line];
        }, [])
        // trim whitespace
        .map((line) => line.trim())
        // reject empty lines and comment lines
        .filter((line) => line && !line.startsWith("#"))
    );
  }

  private parseRecords(records: string[]): Result<NFSExport[], ParsingError> {
    return Result.combine(records.map((record) => this.nfsExportParser.apply(record)));
  }
}

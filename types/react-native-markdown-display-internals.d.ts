/**
 * Type declarations for react-native-markdown-display's pure parser
 * internals, which the package ships untyped.
 *
 * The chat renderer's tests assert the AST shape our rules depend on
 * (task-list marker position, fence info strings, image attributes), so
 * they import these utilities directly. Importing the package's main entry
 * instead would pull in react-native, which the bun test runner cannot
 * parse.
 */
declare module "react-native-markdown-display/src/lib/util/tokensToAST.js" {
  export default function tokensToAST(tokens: unknown[]): unknown[];
}

declare module "react-native-markdown-display/src/lib/util/cleanupTokens.js" {
  export function cleanupTokens(tokens: unknown[]): unknown[];
}

declare module "react-native-markdown-display/src/lib/util/hasParents.js" {
  export default function hasParents(parents: unknown[], type: string): boolean;
}

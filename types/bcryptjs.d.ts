// Ambient declaration to satisfy TypeScript/VS Code when bcryptjs types
// are not being picked up by the editor's TS server. bcryptjs ships its own
// types, but some editor/CI setups can still report a missing declaration.
declare module 'bcryptjs' {
  // sync helpers
  export function genSaltSync(rounds?: number): string;
  export function hashSync(data: string, salt: string | number): string;
  export function compareSync(data: string, encrypted: string): boolean;

  // Promise-based overloads (used when no callback is provided)
  export function genSalt(rounds?: number): Promise<string>;
  export function hash(data: string, saltOrRounds: string | number): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;

  // Callback-based overloads
  export function genSalt(rounds: number | undefined, callback: (err: Error | null, salt: string) => void): void;
  export function hash(data: string, saltOrRounds: string | number, callback: (err: Error | null, hashed: string) => void): void;
  export function compare(data: string, encrypted: string, callback: (err: Error | null, same: boolean) => void): void;

  // Default export compatible with `import bcrypt from 'bcryptjs'`
  const bcryptjs: {
    genSaltSync: typeof genSaltSync;
    genSalt: typeof genSalt;
    hashSync: typeof hashSync;
    hash: typeof hash;
    compareSync: typeof compareSync;
    compare: typeof compare;
  };

  export default bcryptjs;
}

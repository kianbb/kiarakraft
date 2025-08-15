// Minimal ambient declaration to satisfy TypeScript/VS Code when bcryptjs types
// are not being picked up by the editor's TS server. bcryptjs ships its own
// types, but some editor/CI setups can still report a missing declaration.
declare module 'bcryptjs' {
  export function genSaltSync(rounds?: number): string;
  export function genSalt(rounds: number | undefined, callback: (err: Error | null, salt: string) => void): void;
  export function hashSync(data: string, salt: string | number): string;
  export function hash(data: string, salt: string | number, callback: (err: Error | null, hashed: string) => void): void;
  export function compareSync(data: string, encrypted: string): boolean;
  export function compare(data: string, encrypted: string, callback: (err: Error | null, same: boolean) => void): void;
  export default {
    genSaltSync,
    genSalt,
    hashSync,
    hash,
    compareSync,
    compare
  };
}

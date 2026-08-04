export declare function readJson<T>(abs: string): Promise<T | null>;
export declare function sha256(value: string | Buffer): string;
export declare function sha256File(abs: string): Promise<string | null>;
export declare function exists(abs: string): Promise<boolean>;
/** Files under a directory, recursively, root-relative and sorted. Missing dir → []. */
export declare function walkFiles(root: string, rel?: string, out?: string[]): Promise<string[]>;
/** Whole days until an ISO timestamp; negative once it has passed. */
export declare function daysUntil(iso: string | null | undefined, now: Date): number | null;
//# sourceMappingURL=fs.d.ts.map
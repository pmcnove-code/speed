export type SceneTransition = "dissolve" | "cut" | "fade";
export type SceneDirection = { setting: string; characterDescription?: string; transition: SceneTransition };
export declare function normalizeSceneDirection(value: unknown): SceneDirection | null;
export declare function buildScenePrompt(spoken: string, scene?: SceneDirection): string;

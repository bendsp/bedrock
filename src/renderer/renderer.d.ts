export type IElectronAPI = Record<string, never>;

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}

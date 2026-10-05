import type { ThemeSnapshot } from '@acryl/ui/frame';
/** Projects the resolved theme service snapshot onto the desktop document. */
export declare class DesktopThemePresenter {
    private appliedTokens;
    private readonly themeColorMeta;
    constructor();
    /** @param snapshot - current resolved palette and token overrides. */
    apply(snapshot: ThemeSnapshot): void;
    /** Remove only DOM state owned by this presenter. */
    dispose(): void;
}

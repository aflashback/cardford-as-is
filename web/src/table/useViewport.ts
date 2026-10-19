import { useEffect, useState } from 'react';
export function useViewport() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => {
      const height = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
      document.documentElement.style.setProperty('--app-height', `${height}px`);
      // Geometry eligibility uses the layout viewport. The visual viewport can
      // shrink for a keyboard without rotating or making this layout portrait.
      setSize({ width: window.innerWidth, height:window.innerHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return { ...size, portraitPhone: size.width < 700 && size.height > size.width };
}

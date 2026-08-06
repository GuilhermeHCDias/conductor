/* Measures the accessibility node under the cursor against DeviceMirror's content box.
   Real geometry, so the highlight is exact at any mirror size. */
function useInspector() {
  const contentRef = React.useRef(null);
  const [hover, setHover] = React.useState(null);
  const [pinned, setPinned] = React.useState(null);
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    const box = contentRef.current;
    if (!box) return;
    const tally = () => setCount(box.querySelectorAll("[data-a11y-id]").length);
    tally();
    const mo = new MutationObserver(tally);
    mo.observe(box, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const read = (target) => {
    const el = target && target.closest ? target.closest("[data-a11y-id]") : null;
    const box = contentRef.current;
    if (!el || !box) return null;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    /* The mirror may be CSS-scaled; getBoundingClientRect is post-transform, but `highlight`
       is positioned in the content box's own coordinates. Divide the scale back out. */
    const k = box.offsetWidth ? b.width / box.offsetWidth : 1;
    return {
      id: el.getAttribute("data-a11y-id"),
      kind: el.getAttribute("data-a11y-kind"),
      text: el.getAttribute("data-a11y-text"),
      selector: el.getAttribute("data-a11y-selector"),
      rect: { x: (r.left - b.left) / k, y: (r.top - b.top) / k, width: r.width / k, height: r.height / k },
    };
  };

  return {
    contentRef,
    count,
    hover,
    pinned,
    setPinned,
    node: pinned || hover,
    onMouseOver: (e) => setHover(read(e.target)),
    onMouseOut: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(null); },
    onPick: (e) => {
      const n = read(e.target);
      setPinned((p) => (n && p && p.id === n.id ? null : n));
    },
    onContext: (e, open) => {
      e.preventDefault();
      const n = read(e.target);
      if (n) open({ x: e.clientX, y: e.clientY, node: n });
    },
  };
}

/* A device mirror shows the device's own pixels, scaled — never a reflowed layout. So the phone
   keeps a FIXED logical size and only its scale changes to fit the bay it is given. */
const DEVICE = { width: 330, height: 648, bezel: 8 };

function useMirrorFit({ maxWidth = DEVICE.width } = {}) {
  const bayRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const el = bayRef.current;
    if (!el) return;
    const fit = () => {
      const outerW = DEVICE.width + 2 * DEVICE.bezel;
      const outerH = DEVICE.height + 2 * DEVICE.bezel;
      const byWidth = el.clientWidth / outerW;
      const byHeight = el.clientHeight / outerH;
      const cap = maxWidth / DEVICE.width;
      /* Floor to 1/100 so the reserved footprint never rounds a pixel past the bay. */
      setScale(Math.max(0.35, Math.floor(Math.min(cap, byWidth, byHeight) * 100) / 100));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);
  return {
    bayRef,
    scale,
    /* Logical size handed to DeviceMirror — constant, so the app never re-flows. */
    width: DEVICE.width,
    height: DEVICE.height,
    /* Footprint the scaled mirror actually occupies, for the wrapper that reserves layout space. */
    outerWidth: Math.floor((DEVICE.width + 2 * DEVICE.bezel) * scale),
    outerHeight: Math.floor((DEVICE.height + 2 * DEVICE.bezel) * scale),
    /* Spread onto DeviceMirror's style. */
    transform: { transform: "scale(" + scale + ")", transformOrigin: "top left" },
  };
}

Object.assign(window, { useInspector, useMirrorFit });

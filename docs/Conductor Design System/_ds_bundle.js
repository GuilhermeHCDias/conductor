/* @ds-bundle: {"format":4,"namespace":"ConductorDesignSystem_527814","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Checkbox","sourcePath":"components/core/Checkbox.jsx"},{"name":"ICONS","sourcePath":"components/core/Icon.jsx"},{"name":"ICON_NAMES","sourcePath":"components/core/Icon.jsx"},{"name":"ACTION_ICONS","sourcePath":"components/core/Icon.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Kbd","sourcePath":"components/core/Kbd.jsx"},{"name":"SegmentedControl","sourcePath":"components/core/SegmentedControl.jsx"},{"name":"Select","sourcePath":"components/core/Select.jsx"},{"name":"StatusDot","sourcePath":"components/core/StatusDot.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Tooltip","sourcePath":"components/core/Tooltip.jsx"},{"name":"ChatComposer","sourcePath":"components/studio/ChatComposer.jsx"},{"name":"ChatMessage","sourcePath":"components/studio/ChatMessage.jsx"},{"name":"DeviceMirror","sourcePath":"components/studio/DeviceMirror.jsx"},{"name":"DeviceSelector","sourcePath":"components/studio/DeviceSelector.jsx"},{"name":"FileTree","sourcePath":"components/studio/FileTree.jsx"},{"name":"LogStream","sourcePath":"components/studio/LogStream.jsx"},{"name":"RunBar","sourcePath":"components/studio/RunBar.jsx"},{"name":"TestList","sourcePath":"components/studio/TestList.jsx"},{"name":"TitleBar","sourcePath":"components/studio/TitleBar.jsx"},{"name":"YamlEditor","sourcePath":"components/studio/YamlEditor.jsx"},{"name":"ContextMenu","sourcePath":"components/surface/ContextMenu.jsx"},{"name":"Dialog","sourcePath":"components/surface/Dialog.jsx"},{"name":"Divider","sourcePath":"components/surface/Divider.jsx"},{"name":"EmptyState","sourcePath":"components/surface/EmptyState.jsx"},{"name":"GlassPanel","sourcePath":"components/surface/GlassPanel.jsx"},{"name":"PanelHeader","sourcePath":"components/surface/PanelHeader.jsx"},{"name":"TabStrip","sourcePath":"components/surface/TabStrip.jsx"},{"name":"Toolbar","sourcePath":"components/surface/Toolbar.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"a5930bf169a3","components/core/Button.jsx":"cdf2b4b14000","components/core/Checkbox.jsx":"001bc191d563","components/core/Icon.jsx":"02a8b9e18e52","components/core/IconButton.jsx":"dfe290a3ea47","components/core/Input.jsx":"9fdcecd0b61f","components/core/Kbd.jsx":"fe13f03fb620","components/core/SegmentedControl.jsx":"227a9979e57c","components/core/Select.jsx":"66feb21b7caa","components/core/StatusDot.jsx":"16f6665004ee","components/core/Switch.jsx":"b7ad10c7a1f5","components/core/Tooltip.jsx":"76adcc4e387f","components/studio/ChatComposer.jsx":"0365b20f0811","components/studio/ChatMessage.jsx":"84df920d7dd4","components/studio/DeviceMirror.jsx":"5bed2b342dd5","components/studio/DeviceSelector.jsx":"451ef165c1f8","components/studio/FileTree.jsx":"930b2bbebf31","components/studio/LogStream.jsx":"9bf781b3d5c8","components/studio/RunBar.jsx":"9f9c52f9fb0f","components/studio/TestList.jsx":"954555828845","components/studio/TitleBar.jsx":"d15171c8ed3b","components/studio/YamlEditor.jsx":"5cda21f876bb","components/surface/ContextMenu.jsx":"6000eb4caffe","components/surface/Dialog.jsx":"aff822164d2f","components/surface/Divider.jsx":"5b4485a0dd2f","components/surface/EmptyState.jsx":"5155589764d8","components/surface/GlassPanel.jsx":"9362b153ec84","components/surface/PanelHeader.jsx":"a70d030b441c","components/surface/TabStrip.jsx":"dda2dd4d62c1","components/surface/Toolbar.jsx":"dcab2b0b1dad","ui_kits/conductor-c-aurora/AppUnderTest.jsx":"baf680a07a68","ui_kits/conductor-c-aurora/CDoctor.jsx":"31835493e6cd","ui_kits/conductor-c-aurora/CDoctorB.jsx":"22bde7c1d065","ui_kits/conductor-c-aurora/CRegions.jsx":"ff6f707b85ed","ui_kits/conductor-c-aurora/CShell.jsx":"31090bb69399","ui_kits/conductor-c-aurora/data.jsx":"caa7f5a0e053","ui_kits/conductor-c-aurora/useInspector.jsx":"8273301df2b8"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {
  const __ds_ns = (window.ConductorDesignSystem_527814 = window.ConductorDesignSystem_527814 || {});

  const __ds_scope = {};

  __ds_ns.__errors = __ds_ns.__errors || [];

  // components/core/Icon.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      /* Conductor's glyph set is Lucide (ISC), pinned at v0.577.0 and vendored into
   assets/icons/*.svg. The same path data is inlined here so <Icon> renders real
   SVG — colourable via currentColor, no network fetch, no icon font. */
      const ICONS = {
        play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
        square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
        'circle-stop':
          '<circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
        'rotate-cw':
          '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
        'refresh-cw':
          '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
        smartphone:
          '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
        'monitor-smartphone':
          '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"/><path d="M10 19v-3.96 3.15"/><path d="M7 19h5"/><rect width="6" height="10" x="16" y="12" rx="2"/>',
        camera:
          '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
        crosshair:
          '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
        'mouse-pointer-click':
          '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
        'square-dashed-mouse-pointer':
          '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/><path d="M21 9v2"/><path d="M3 14v1"/>',
        'text-cursor-input':
          '<path d="M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6"/><path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7"/><path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1"/><path d="M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1"/><path d="M9 6v12"/>',
        'chevrons-up-down': '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
        eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
        'eye-off':
          '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
        keyboard:
          '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
        'keyboard-off':
          '<path d="M 20 4 A2 2 0 0 1 22 6"/><path d="M 22 6 L 22 16.41"/><path d="M 7 16 L 16 16"/><path d="M 9.69 4 L 20 4"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="m2 2 20 20"/><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2"/><path d="M6 8h.01"/><path d="M8 12h.01"/>',
        timer:
          '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
        'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        house:
          '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
        pencil:
          '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
        'trash-2':
          '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        'move-horizontal': '<path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>',
        hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
        'chevron-right': '<path d="m9 18 6-6-6-6"/>',
        'chevron-down': '<path d="m6 9 6 6 6-6"/>',
        'chevron-left': '<path d="m15 18-6-6 6-6"/>',
        'chevron-up': '<path d="m18 15-6-6-6 6"/>',
        plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
        minus: '<path d="M5 12h14"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
        ellipsis:
          '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
        'ellipsis-vertical':
          '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
        'file-code':
          '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/>',
        'file-text':
          '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
        folder:
          '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
        'folder-open':
          '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
        'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
        'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
        'circle-alert':
          '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
        'triangle-alert':
          '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        'circle-help':
          '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        'loader-circle': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
        'list-checks':
          '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
        cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
        'hard-drive':
          '<path d="M10 16h.01"/><path d="M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M21.946 12.013H2.054"/><path d="M6 16h.01"/>',
        terminal: '<path d="M12 19h8"/><path d="m4 17 6-6-6-6"/>',
        'scroll-text':
          '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
        sparkles:
          '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
        'wand-sparkles':
          '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
        send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
        bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
        paperclip:
          '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
        settings:
          '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
        moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
        palette:
          '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
        'panel-left': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
        'panel-bottom': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18"/>',
        'maximize-2':
          '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
        'grip-vertical':
          '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
        'undo-2':
          '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
        'redo-2':
          '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
        repeat:
          '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
        'git-branch':
          '<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
        variable:
          '<path d="M8 21s-4-3-4-9 4-9 4-9"/><path d="M16 3s4 3 4 9-4 9-4 9"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/>',
        zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
        activity:
          '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
        layers:
          '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
        filter:
          '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
        download:
          '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
        wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
        'battery-medium':
          '<path d="M10 14v-4"/><path d="M22 14v-4"/><path d="M6 14v-4"/><rect x="2" y="6" width="16" height="12" rx="2"/>',
      };
      const ICON_NAMES = Object.keys(ICONS);

      /* Semantic aliases: Maestro command -> glyph. Keeps command menus consistent. */
      const ACTION_ICONS = {
        tapOn: 'mouse-pointer-click',
        doubleTapOn: 'square-dashed-mouse-pointer',
        longPressOn: 'hand',
        inputText: 'text-cursor-input',
        eraseText: 'undo-2',
        swipe: 'move-horizontal',
        scroll: 'chevrons-up-down',
        assertVisible: 'eye',
        assertNotVisible: 'eye-off',
        waitForAnimationToEnd: 'timer',
        extendedWaitUntil: 'clock',
        hideKeyboard: 'keyboard-off',
        pressKey: 'keyboard',
        back: 'arrow-left',
        launchApp: 'play',
        stopApp: 'circle-stop',
        clearState: 'trash-2',
        copyTextFrom: 'copy',
        takeScreenshot: 'camera',
        runFlow: 'git-branch',
        repeat: 'repeat',
        evalScript: 'terminal',
        setVariable: 'variable',
      };
      function Icon({
        name,
        size = 16,
        strokeWidth = 1.75,
        color = 'currentColor',
        label,
        style,
        className,
        ...rest
      }) {
        const body = ICONS[name];
        const px = typeof size === 'number' ? size + 'px' : size;
        if (!body) {
          return /*#__PURE__*/ React.createElement(
            'span',
            _extends(
              {
                'aria-hidden': 'true',
                className: className,
                style: {
                  display: 'inline-block',
                  width: px,
                  height: px,
                  borderRadius: '3px',
                  border: '1px dashed var(--edge-strong)',
                  ...style,
                },
              },
              rest,
            ),
          );
        }
        return /*#__PURE__*/ React.createElement(
          'svg',
          _extends(
            {
              xmlns: 'http://www.w3.org/2000/svg',
              width: px,
              height: px,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: color,
              strokeWidth: strokeWidth,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              role: label ? 'img' : undefined,
              'aria-label': label,
              'aria-hidden': label ? undefined : 'true',
              className: className,
              style: {
                display: 'block',
                flex: 'none',
                ...style,
              },
              dangerouslySetInnerHTML: {
                __html: body,
              },
            },
            rest,
          ),
        );
      }
      Object.assign(__ds_scope, { ICONS, ICON_NAMES, ACTION_ICONS, Icon });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Icon.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/Badge.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const TONES = {
        neutral: {
          bg: 'var(--glass-2)',
          fg: 'var(--text-secondary)',
          edge: 'var(--edge-2)',
        },
        accent: {
          bg: 'var(--accent-quiet)',
          fg: 'var(--text-accent)',
          edge: 'var(--accent-edge)',
        },
        ai: {
          bg: 'var(--ai-quiet)',
          fg: 'var(--text-ai)',
          edge: 'var(--ai-edge)',
        },
        pass: {
          bg: 'var(--state-pass-quiet)',
          fg: 'var(--state-pass)',
          edge: 'var(--state-pass-edge)',
        },
        fail: {
          bg: 'var(--state-fail-quiet)',
          fg: 'var(--state-fail)',
          edge: 'var(--state-fail-edge)',
        },
        running: {
          bg: 'var(--state-running-quiet)',
          fg: 'var(--state-running)',
          edge: 'var(--state-running-edge)',
        },
        idle: {
          bg: 'var(--state-idle-quiet)',
          fg: 'var(--text-tertiary)',
          edge: 'var(--edge-1)',
        },
      };
      function Badge({
        children,
        tone = 'neutral',
        icon,
        mono = false,
        size = 'md',
        uppercase = false,
        style,
        ...rest
      }) {
        const t = TONES[tone] || TONES.neutral;
        const sm = size === 'sm';
        return /*#__PURE__*/ React.createElement(
          'span',
          _extends(
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: sm ? 3 : 4,
                height: sm ? 17 : 20,
                padding: sm ? '0 5px' : '0 7px',
                borderRadius: 'var(--radius-xs)',
                background: t.bg,
                color: t.fg,
                border: 'var(--border-hair) solid ' + t.edge,
                font: mono ? 'var(--type-mono-label)' : 'var(--type-label)',
                letterSpacing: uppercase
                  ? 'var(--ls-caps)'
                  : mono
                    ? 'var(--ls-mono)'
                    : 'var(--ls-body)',
                textTransform: uppercase ? 'uppercase' : 'none',
                whiteSpace: 'nowrap',
                flex: 'none',
                ...style,
              },
            },
            rest,
          ),
          icon
            ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: icon,
                size: sm ? 10 : 11,
                strokeWidth: 2,
              })
            : null,
          children,
        );
      }
      Object.assign(__ds_scope, { Badge });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Badge.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/Button.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const SIZES = {
        sm: {
          h: 'var(--control-h)',
          pad: '0 10px',
          gap: '6px',
          font: 'var(--type-caption)',
          radius: 'var(--radius-sm)',
          icon: 14,
        },
        md: {
          h: 'var(--control-h-lg)',
          pad: '0 14px',
          gap: '7px',
          font: 'var(--type-body-strong)',
          radius: 'var(--radius-md)',
          icon: 16,
        },
        lg: {
          h: '42px',
          pad: '0 18px',
          gap: '8px',
          font: 'var(--w-semibold) var(--size-14) / 1.3 var(--font-ui)',
          radius: 'var(--radius-md)',
          icon: 18,
        },
      };
      function fill(variant, hover, active) {
        switch (variant) {
          case 'primary':
            return {
              background: active ? 'var(--accent-strong)' : 'var(--accent)',
              color: 'var(--accent-on)',
              border: 'var(--border-hair) solid transparent',
              boxShadow: hover
                ? 'var(--glow-accent)'
                : 'inset 0 1px 0 0 oklch(100% 0 0 / 0.28), var(--shadow-1)',
            };
          case 'glass':
            return {
              background: active
                ? 'var(--glass-active)'
                : hover
                  ? 'var(--glass-2)'
                  : 'var(--glass-1)',
              color: 'var(--text-primary)',
              border:
                'var(--border-hair) solid ' + (hover ? 'var(--edge-strong)' : 'var(--edge-2)'),
              boxShadow: 'var(--shadow-inset-top), var(--shadow-1)',
              backdropFilter: 'blur(var(--blur-2)) saturate(var(--saturate-glass))',
              WebkitBackdropFilter: 'blur(var(--blur-2)) saturate(var(--saturate-glass))',
            };
          case 'ghost':
            return {
              background: active
                ? 'var(--glass-active)'
                : hover
                  ? 'var(--glass-hover)'
                  : 'transparent',
              color: hover ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'var(--border-hair) solid transparent',
              boxShadow: 'none',
            };
          case 'ai':
            return {
              background: hover ? 'var(--ai-quiet-hover)' : 'var(--ai-quiet)',
              color: 'var(--text-ai)',
              border: 'var(--border-hair) solid var(--ai-edge)',
              boxShadow: hover ? 'var(--glow-ai)' : 'var(--shadow-inset-top)',
            };
          case 'danger':
            return {
              background: hover ? 'var(--state-fail-quiet-hover)' : 'var(--state-fail-quiet)',
              color: 'var(--state-fail)',
              border: 'var(--border-hair) solid var(--state-fail-edge)',
              boxShadow: 'var(--shadow-inset-top)',
            };
          default:
            return {};
        }
      }
      function Button({
        children,
        variant = 'glass',
        size = 'md',
        icon,
        iconEnd,
        loading = false,
        disabled = false,
        fullWidth = false,
        pill = false,
        onClick,
        type = 'button',
        style,
        ...rest
      }) {
        const [hover, setHover] = React.useState(false);
        const [active, setActive] = React.useState(false);
        const s = SIZES[size] || SIZES.md;
        const off = disabled || loading;
        return /*#__PURE__*/ React.createElement(
          'button',
          _extends(
            {
              type: type,
              disabled: off,
              onClick: onClick,
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => {
                setHover(false);
                setActive(false);
              },
              onMouseDown: () => setActive(true),
              onMouseUp: () => setActive(false),
              style: {
                display: fullWidth ? 'flex' : 'inline-flex',
                width: fullWidth ? '100%' : undefined,
                alignItems: 'center',
                justifyContent: 'center',
                gap: s.gap,
                height: s.h,
                padding: s.pad,
                font: s.font,
                letterSpacing: 'var(--ls-body)',
                borderRadius: pill ? 'var(--radius-pill)' : s.radius,
                cursor: off ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition:
                  'var(--t-hover), var(--t-press), box-shadow var(--dur-fast) var(--ease-out)',
                transform: active && !off ? 'scale(var(--press-scale))' : 'scale(1)',
                opacity: off ? 0.45 : 1,
                ...fill(variant, hover && !off, active && !off),
                ...style,
              },
            },
            rest,
          ),
          loading
            ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: 'loader-circle',
                size: s.icon,
                style: {
                  animation: 'cd-spin 700ms linear infinite',
                },
              })
            : icon
              ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                  name: icon,
                  size: s.icon,
                })
              : null,
          children,
          iconEnd
            ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: iconEnd,
                size: s.icon,
              })
            : null,
        );
      }
      Object.assign(__ds_scope, { Button });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Button.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/Checkbox.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Checkbox({
        checked = false,
        onChange,
        label,
        hint,
        disabled = false,
        style,
        ...rest
      }) {
        const [hover, setHover] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          'label',
          {
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            style: {
              display: 'inline-flex',
              alignItems: hint ? 'flex-start' : 'center',
              gap: 'var(--space-4)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
              userSelect: 'none',
              ...style,
            },
          },
          /*#__PURE__*/ React.createElement(
            'input',
            _extends(
              {
                type: 'checkbox',
                checked: checked,
                onChange: onChange,
                disabled: disabled,
                style: {
                  position: 'absolute',
                  opacity: 0,
                  width: 1,
                  height: 1,
                  margin: -1,
                },
              },
              rest,
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'grid',
                placeItems: 'center',
                width: 16,
                height: 16,
                flex: 'none',
                marginTop: hint ? 2 : 0,
                borderRadius: 'var(--radius-xs)',
                background: checked ? 'var(--accent)' : 'var(--glass-sunken)',
                border:
                  'var(--border-hair) solid ' +
                  (checked ? 'transparent' : hover ? 'var(--edge-strong)' : 'var(--edge-sunken)'),
                boxShadow: checked ? 'var(--shadow-1)' : 'var(--shadow-inset-sunken)',
                transition: 'var(--t-hover)',
              },
            },
            checked
              ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                  name: 'check',
                  size: 11,
                  strokeWidth: 3,
                  color: 'var(--accent-on)',
                })
              : null,
          ),
          label
            ? /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    display: 'grid',
                    gap: 1,
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-body)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                    },
                  },
                  label,
                ),
                hint
                  ? /*#__PURE__*/ React.createElement(
                      'span',
                      {
                        style: {
                          font: 'var(--type-caption)',
                          color: 'var(--text-tertiary)',
                        },
                      },
                      hint,
                    )
                  : null,
              )
            : null,
        );
      }
      Object.assign(__ds_scope, { Checkbox });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Checkbox.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/IconButton.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const SIZES = {
        sm: 24,
        md: 30,
        lg: 36,
      };
      const GLYPH = {
        sm: 14,
        md: 16,
        lg: 18,
      };
      function IconButton({
        icon,
        label,
        size = 'md',
        variant = 'ghost',
        selected = false,
        disabled = false,
        pill = false,
        onClick,
        style,
        ...rest
      }) {
        const [hover, setHover] = React.useState(false);
        const [active, setActive] = React.useState(false);
        const box = SIZES[size] || SIZES.md;
        const on = selected || active;
        const tint =
          variant === 'danger'
            ? 'var(--state-fail)'
            : variant === 'ai'
              ? 'var(--text-ai)'
              : selected
                ? 'var(--accent)'
                : hover
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)';
        const bg = selected
          ? 'var(--accent-quiet)'
          : active
            ? 'var(--glass-active)'
            : hover
              ? 'var(--glass-hover)'
              : variant === 'glass'
                ? 'var(--glass-1)'
                : 'transparent';
        return /*#__PURE__*/ React.createElement(
          'button',
          _extends(
            {
              type: 'button',
              'aria-label': label,
              'aria-pressed': selected || undefined,
              title: label,
              disabled: disabled,
              onClick: onClick,
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => {
                setHover(false);
                setActive(false);
              },
              onMouseDown: () => setActive(true),
              onMouseUp: () => setActive(false),
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: box,
                height: box,
                flex: 'none',
                padding: 0,
                borderRadius: pill
                  ? 'var(--radius-pill)'
                  : size === 'sm'
                    ? 'var(--radius-xs)'
                    : 'var(--radius-sm)',
                background: bg,
                color: tint,
                border:
                  'var(--border-hair) solid ' +
                  (variant === 'glass' || selected ? 'var(--edge-2)' : 'transparent'),
                boxShadow: variant === 'glass' ? 'var(--shadow-inset-top)' : 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.4 : 1,
                transition: 'var(--t-hover), var(--t-press)',
                transform: on && !disabled ? 'scale(var(--press-scale))' : 'scale(1)',
                ...style,
              },
            },
            rest,
          ),
          /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
            name: icon,
            size: GLYPH[size] || 16,
          }),
        );
      }
      Object.assign(__ds_scope, { IconButton });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/IconButton.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/Input.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Input({
        value,
        onChange,
        placeholder,
        icon,
        suffix,
        mono = false,
        size = 'md',
        invalid = false,
        disabled = false,
        fullWidth = true,
        onKeyDown,
        style,
        inputStyle,
        ...rest
      }) {
        const [focus, setFocus] = React.useState(false);
        const [hover, setHover] = React.useState(false);
        const h = size === 'sm' ? 'var(--control-h)' : 'var(--control-h-lg)';
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            style: {
              display: fullWidth ? 'flex' : 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              width: fullWidth ? '100%' : undefined,
              height: h,
              padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--glass-sunken)',
              border:
                'var(--border-hair) solid ' +
                (invalid
                  ? 'var(--state-fail)'
                  : focus
                    ? 'var(--accent)'
                    : hover
                      ? 'var(--edge-2)'
                      : 'var(--edge-sunken)'),
              boxShadow: focus ? 'var(--glow-accent)' : 'var(--shadow-inset-sunken)',
              color: 'var(--text-primary)',
              opacity: disabled ? 0.45 : 1,
              transition: 'var(--t-hover), box-shadow var(--dur-fast) var(--ease-out)',
              ...style,
            },
          },
          icon
            ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: icon,
                size: 14,
                color: focus ? 'var(--accent)' : 'var(--text-tertiary)',
              })
            : null,
          /*#__PURE__*/ React.createElement(
            'input',
            _extends(
              {
                value: value,
                onChange: onChange,
                placeholder: placeholder,
                disabled: disabled,
                onFocus: () => setFocus(true),
                onBlur: () => setFocus(false),
                onKeyDown: onKeyDown,
                style: {
                  flex: 1,
                  minWidth: 0,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  padding: 0,
                  font: mono
                    ? 'var(--type-code-sm)'
                    : size === 'sm'
                      ? 'var(--type-caption)'
                      : 'var(--type-body)',
                  letterSpacing: mono ? 'var(--ls-mono)' : 'var(--ls-body)',
                  color: 'inherit',
                  ...inputStyle,
                },
              },
              rest,
            ),
          ),
          suffix
            ? /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-mono-label)',
                    color: 'var(--text-tertiary)',
                    flex: 'none',
                  },
                },
                suffix,
              )
            : null,
        );
      }
      Object.assign(__ds_scope, { Input });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Input.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/Kbd.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Kbd({ children, keys, style, ...rest }) {
        const list =
          keys ||
          (typeof children === 'string' ? children.split('+').map((k) => k.trim()) : [children]);
        return /*#__PURE__*/ React.createElement(
          'span',
          _extends(
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                ...style,
              },
            },
            rest,
          ),
          list.map((k, i) =>
            /*#__PURE__*/ React.createElement(
              'span',
              {
                key: i,
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  padding: '0 4px',
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--glass-2)',
                  border: 'var(--border-hair) solid var(--edge-2)',
                  boxShadow: 'var(--shadow-inset-top)',
                  font: 'var(--type-mono-label)',
                  color: 'var(--text-tertiary)',
                },
              },
              k,
            ),
          ),
        );
      }
      Object.assign(__ds_scope, { Kbd });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Kbd.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/SegmentedControl.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function SegmentedControl({
        value,
        options = [],
        onChange,
        size = 'md',
        fullWidth = false,
        style,
        ...rest
      }) {
        const sm = size === 'sm';
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              role: 'tablist',
              style: {
                display: fullWidth ? 'flex' : 'inline-flex',
                alignItems: 'center',
                gap: 2,
                padding: 2,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--glass-sunken)',
                border: 'var(--border-hair) solid var(--edge-sunken)',
                boxShadow: 'var(--shadow-inset-sunken)',
                ...style,
              },
            },
            rest,
          ),
          options.map((o) => {
            const opt =
              typeof o === 'string'
                ? {
                    value: o,
                    label: o,
                  }
                : o;
            const on = opt.value === value;
            return /*#__PURE__*/ React.createElement(
              'button',
              {
                key: opt.value,
                type: 'button',
                role: 'tab',
                'aria-selected': on,
                onClick: () => onChange && onChange(opt.value),
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  flex: fullWidth ? 1 : 'none',
                  height: sm ? 22 : 26,
                  padding: sm ? '0 8px' : '0 11px',
                  borderRadius: 'var(--radius-xs)',
                  /* AppKit's segmented control is a raised puck sliding on a recessed track: the
           selected segment is lighter than its surroundings and casts a small shadow. */
                  background: on ? 'var(--glass-3)' : 'transparent',
                  border: 'var(--border-hair) solid ' + (on ? 'var(--edge-2)' : 'transparent'),
                  boxShadow: on
                    ? 'inset 0 0.5px 0 var(--specular), 0 1px 2px oklch(0% 0 0 / 0.22)'
                    : 'none',
                  color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  font: sm ? 'var(--type-label)' : 'var(--type-caption)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'var(--t-hover), box-shadow var(--dur-fast) var(--ease-out)',
                },
              },
              opt.icon
                ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                    name: opt.icon,
                    size: sm ? 12 : 13,
                  })
                : null,
              opt.label,
            );
          }),
        );
      }
      Object.assign(__ds_scope, { SegmentedControl });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/SegmentedControl.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/Select.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Select({
        value,
        options = [],
        onChange,
        icon,
        size = 'md',
        disabled = false,
        fullWidth = false,
        style,
        ...rest
      }) {
        const [hover, setHover] = React.useState(false);
        const [focus, setFocus] = React.useState(false);
        const h = size === 'sm' ? 'var(--control-h)' : 'var(--control-h-lg)';
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            style: {
              position: 'relative',
              display: fullWidth ? 'flex' : 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              width: fullWidth ? '100%' : undefined,
              height: h,
              padding: '0 8px 0 10px',
              borderRadius: 'var(--radius-sm)',
              background: hover ? 'var(--glass-2)' : 'var(--glass-1)',
              border:
                'var(--border-hair) solid ' +
                (focus ? 'var(--accent)' : hover ? 'var(--edge-strong)' : 'var(--edge-2)'),
              boxShadow: 'var(--shadow-inset-top)',
              color: 'var(--text-primary)',
              opacity: disabled ? 0.45 : 1,
              transition: 'var(--t-hover)',
              ...style,
            },
          },
          icon
            ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: icon,
                size: 14,
                color: 'var(--text-tertiary)',
              })
            : null,
          /*#__PURE__*/ React.createElement(
            'select',
            _extends(
              {
                value: value,
                onChange: onChange,
                disabled: disabled,
                onFocus: () => setFocus(true),
                onBlur: () => setFocus(false),
                style: {
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  flex: 1,
                  minWidth: 0,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  padding: 0,
                  paddingRight: 'var(--space-5)',
                  font: size === 'sm' ? 'var(--type-caption)' : 'var(--type-body)',
                  color: 'inherit',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                },
              },
              rest,
            ),
            options.map((o) => {
              const opt =
                typeof o === 'string'
                  ? {
                      value: o,
                      label: o,
                    }
                  : o;
              return /*#__PURE__*/ React.createElement(
                'option',
                {
                  key: opt.value,
                  value: opt.value,
                  style: {
                    background: 'var(--ink-900)',
                    color: 'var(--text-primary)',
                  },
                },
                opt.label,
              );
            }),
          ),
          /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
            name: 'chevrons-up-down',
            size: 13,
            color: 'var(--text-tertiary)',
            style: {
              position: 'absolute',
              right: 8,
              pointerEvents: 'none',
            },
          }),
        );
      }
      Object.assign(__ds_scope, { Select });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Select.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/StatusDot.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const COLORS = {
        pass: 'var(--state-pass)',
        fail: 'var(--state-fail)',
        running: 'var(--state-running)',
        idle: 'var(--state-idle)',
        connected: 'var(--state-pass)',
        offline: 'var(--state-idle)',
      };
      function StatusDot({ state = 'idle', size = 8, pulse = false, label, style, ...rest }) {
        const c = COLORS[state] || COLORS.idle;
        const dot = /*#__PURE__*/ React.createElement(
          'span',
          _extends(
            {
              style: {
                position: 'relative',
                display: 'inline-block',
                width: size,
                height: size,
                flex: 'none',
                borderRadius: 'var(--radius-pill)',
                background: c,
                boxShadow:
                  state === 'idle' || state === 'offline'
                    ? 'none'
                    : '0 0 0 3px color-mix(in oklch, ' + c + ' 22%, transparent)',
                animation: pulse ? 'cd-pulse 1.4s var(--ease-in-out) infinite' : undefined,
                ...style,
              },
            },
            rest,
          ),
        );
        if (!label) return dot;
        return /*#__PURE__*/ React.createElement(
          'span',
          {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            },
          },
          dot,
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-caption)',
                color: 'var(--text-secondary)',
              },
            },
            label,
          ),
        );
      }
      Object.assign(__ds_scope, { StatusDot });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/StatusDot.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/Switch.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Switch({
        checked = false,
        onChange,
        label,
        disabled = false,
        size = 'md',
        style,
        ...rest
      }) {
        const w = size === 'sm' ? 30 : 38;
        const h = size === 'sm' ? 18 : 22;
        const knob = h - 6;
        return /*#__PURE__*/ React.createElement(
          'label',
          {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              flex: 'none',
              gap: 'var(--space-5)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
              userSelect: 'none',
              ...style,
            },
          },
          /*#__PURE__*/ React.createElement(
            'input',
            _extends(
              {
                type: 'checkbox',
                role: 'switch',
                checked: checked,
                onChange: onChange,
                disabled: disabled,
                style: {
                  position: 'absolute',
                  opacity: 0,
                  width: 1,
                  height: 1,
                  margin: -1,
                },
              },
              rest,
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                position: 'relative',
                width: w,
                height: h,
                flex: 'none',
                borderRadius: 'var(--radius-pill)',
                background: checked ? 'var(--accent)' : 'var(--glass-sunken)',
                border:
                  'var(--border-hair) solid ' + (checked ? 'transparent' : 'var(--edge-sunken)'),
                boxShadow: checked ? 'var(--shadow-1)' : 'var(--shadow-inset-sunken)',
                transition:
                  'background var(--dur-base) var(--ease-glass), border-color var(--dur-base) var(--ease-glass)',
              },
            },
            /*#__PURE__*/ React.createElement('span', {
              style: {
                position: 'absolute',
                top: 2,
                left: checked ? w - knob - 4 : 2,
                width: knob,
                height: knob,
                borderRadius: 'var(--radius-pill)',
                background: checked ? 'var(--accent-on)' : 'var(--text-secondary)',
                boxShadow: '0 1px 2px oklch(0% 0 0 / 0.30)',
                transition:
                  'left var(--dur-base) var(--ease-glass), background var(--dur-base) var(--ease-glass)',
              },
            }),
          ),
          label
            ? /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-body)',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                  },
                },
                label,
              )
            : null,
        );
      }
      Object.assign(__ds_scope, { Switch });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Switch.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/core/Tooltip.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Tooltip({ children, content, side = 'top', shortcut, style, ...rest }) {
        const [open, setOpen] = React.useState(false);
        const pos =
          side === 'bottom'
            ? {
                top: 'calc(100% + 6px)',
                left: '50%',
                transform: 'translateX(-50%)',
              }
            : side === 'left'
              ? {
                  right: 'calc(100% + 6px)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }
              : side === 'right'
                ? {
                    left: 'calc(100% + 6px)',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }
                : {
                    bottom: 'calc(100% + 6px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  };
        return /*#__PURE__*/ React.createElement(
          'span',
          _extends(
            {
              onMouseEnter: () => setOpen(true),
              onMouseLeave: () => setOpen(false),
              style: {
                position: 'relative',
                display: 'inline-flex',
                ...style,
              },
            },
            rest,
          ),
          children,
          /*#__PURE__*/ React.createElement(
            'span',
            {
              role: 'tooltip',
              style: {
                position: 'absolute',
                zIndex: 60,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: '5px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--glass-3)',
                backdropFilter: 'blur(var(--blur-3)) saturate(var(--saturate-glass))',
                WebkitBackdropFilter: 'blur(var(--blur-3)) saturate(var(--saturate-glass))',
                border: 'var(--border-hair) solid var(--edge-2)',
                boxShadow: 'var(--shadow-inset-top), var(--shadow-2)',
                color: 'var(--text-primary)',
                font: 'var(--type-caption)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                opacity: open ? 1 : 0,
                transition: 'opacity var(--dur-fast) var(--ease-out)',
                ...pos,
              },
            },
            content,
            shortcut
              ? /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-mono-label)',
                      color: 'var(--text-tertiary)',
                    },
                  },
                  shortcut,
                )
              : null,
          ),
        );
      }
      Object.assign(__ds_scope, { Tooltip });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Tooltip.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/ChatComposer.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function ChatComposer({
        value = '',
        onChange,
        onSubmit,
        placeholder = 'Ask Conductor to write a step…',
        context,
        disabled = false,
        busy = false,
        style,
        ...rest
      }) {
        const [focus, setFocus] = React.useState(false);
        const send = () => value.trim() && onSubmit && onSubmit(value);
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'grid',
                gap: 'var(--space-4)',
                padding: 'var(--space-5)',
                borderTop: 'var(--border-hair) solid var(--edge-1)',
                flex: 'none',
                ...style,
              },
            },
            rest,
          ),
          context
            ? /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: '4px 7px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--accent-quiet)',
                    border: 'var(--border-hair) solid var(--accent-edge)',
                    width: 'fit-content',
                    maxWidth: '100%',
                  },
                },
                /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                  name: 'crosshair',
                  size: 11,
                  color: 'var(--accent)',
                }),
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-mono-label)',
                      color: 'var(--text-accent)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  },
                  context,
                ),
                /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                  name: 'x',
                  size: 11,
                  color: 'var(--text-tertiary)',
                  style: {
                    cursor: 'pointer',
                  },
                }),
              )
            : null,
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gap: 'var(--space-4)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--glass-sunken)',
                border: 'var(--border-hair) solid ' + (focus ? 'var(--ai)' : 'var(--edge-sunken)'),
                boxShadow: focus ? 'var(--glow-ai)' : 'var(--shadow-inset-sunken)',
                transition:
                  'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
              },
            },
            /*#__PURE__*/ React.createElement('textarea', {
              value: value,
              onChange: onChange,
              placeholder: placeholder,
              disabled: disabled,
              rows: 2,
              onFocus: () => setFocus(true),
              onBlur: () => setFocus(false),
              onKeyDown: (e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              },
              style: {
                width: '100%',
                resize: 'none',
                background: 'none',
                border: 'none',
                outline: 'none',
                padding: 0,
                font: 'var(--type-body)',
                color: 'var(--text-primary)',
              },
            }),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                },
              },
              /*#__PURE__*/ React.createElement(__ds_scope.IconButton, {
                icon: 'paperclip',
                label: 'Attach screenshot',
                size: 'sm',
              }),
              /*#__PURE__*/ React.createElement(__ds_scope.IconButton, {
                icon: 'crosshair',
                label: 'Pick an element',
                size: 'sm',
              }),
              /*#__PURE__*/ React.createElement('span', {
                style: {
                  flex: 1,
                },
              }),
              /*#__PURE__*/ React.createElement(__ds_scope.Kbd, null, '\u2318 + \u21B5'),
              /*#__PURE__*/ React.createElement(
                'button',
                {
                  type: 'button',
                  'aria-label': 'Send',
                  onClick: send,
                  disabled: disabled || busy || !value.trim(),
                  style: {
                    display: 'grid',
                    placeItems: 'center',
                    width: 26,
                    height: 26,
                    borderRadius: 'var(--radius-xs)',
                    background: value.trim() ? 'var(--ai)' : 'var(--glass-2)',
                    border:
                      'var(--border-hair) solid ' +
                      (value.trim() ? 'transparent' : 'var(--edge-2)'),
                    color: value.trim() ? 'var(--text-inverse)' : 'var(--text-disabled)',
                    cursor: value.trim() ? 'pointer' : 'not-allowed',
                    transition: 'var(--t-hover)',
                  },
                },
                /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                  name: busy ? 'loader-circle' : 'send',
                  size: 13,
                  style: {
                    animation: busy ? 'cd-spin 700ms linear infinite' : undefined,
                  },
                }),
              ),
            ),
          ),
        );
      }
      Object.assign(__ds_scope, { ChatComposer });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/ChatComposer.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/ChatMessage.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function ChatMessage({
        role = 'assistant',
        children,
        code,
        codeLabel = 'flow.yaml',
        onInsert,
        onCopy,
        pending = false,
        style,
        ...rest
      }) {
        const user = role === 'user';
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: user ? 'flex-end' : 'stretch',
                gap: 'var(--space-4)',
                ...style,
              },
            },
            rest,
          ),
          !user
            ? /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      display: 'grid',
                      placeItems: 'center',
                      width: 18,
                      height: 18,
                      borderRadius: 'var(--radius-xs)',
                      background: 'var(--ai-quiet)',
                      color: 'var(--text-ai)',
                      flex: 'none',
                    },
                  },
                  /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                    name: 'sparkles',
                    size: 11,
                  }),
                ),
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-label)',
                      letterSpacing: 'var(--ls-caps)',
                      textTransform: 'uppercase',
                      color: 'var(--text-ai)',
                    },
                  },
                  'Conductor',
                ),
              )
            : null,
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                maxWidth: user ? '88%' : '100%',
                padding: user ? '8px 11px' : 0,
                borderRadius: user ? 'var(--radius-md)' : 0,
                background: user ? 'var(--glass-2)' : 'transparent',
                border: user ? 'var(--border-hair) solid var(--edge-2)' : 'none',
                boxShadow: user ? 'var(--shadow-inset-top)' : 'none',
                font: 'var(--type-body)',
                color: user ? 'var(--text-primary)' : 'var(--text-secondary)',
                textWrap: 'pretty',
              },
            },
            pending
              ? /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      color: 'var(--text-ai)',
                    },
                  },
                  /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                    name: 'loader-circle',
                    size: 13,
                    style: {
                      animation: 'cd-spin 700ms linear infinite',
                    },
                  }),
                  'Reading the accessibility tree\u2026',
                )
              : children,
          ),
          code
            ? /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--glass-sunken)',
                    border: 'var(--border-hair) solid var(--ai-edge)',
                    boxShadow: 'var(--shadow-inset-sunken)',
                    overflow: 'hidden',
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      height: 26,
                      padding: '0 var(--space-4)',
                      borderBottom: 'var(--border-hair) solid var(--edge-1)',
                    },
                  },
                  /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                    name: 'file-code',
                    size: 12,
                    color: 'var(--text-ai)',
                  }),
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        font: 'var(--type-mono-label)',
                        color: 'var(--text-tertiary)',
                        flex: 1,
                      },
                    },
                    codeLabel,
                  ),
                  onCopy
                    ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                        name: 'copy',
                        size: 12,
                        color: 'var(--text-disabled)',
                        style: {
                          cursor: 'pointer',
                        },
                        onClick: onCopy,
                      })
                    : null,
                ),
                /*#__PURE__*/ React.createElement(
                  'pre',
                  {
                    style: {
                      margin: 0,
                      padding: 'var(--space-4) var(--space-5)',
                      font: 'var(--type-code-sm)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    },
                  },
                  code,
                ),
                onInsert
                  ? /*#__PURE__*/ React.createElement(
                      'div',
                      {
                        style: {
                          padding: '0 var(--space-4) var(--space-4)',
                        },
                      },
                      /*#__PURE__*/ React.createElement(
                        __ds_scope.Button,
                        {
                          variant: 'ai',
                          size: 'sm',
                          icon: 'plus',
                          onClick: onInsert,
                          fullWidth: true,
                        },
                        'Insert into flow',
                      ),
                    )
                  : null,
              )
            : null,
        );
      }
      Object.assign(__ds_scope, { ChatMessage });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/ChatMessage.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/DeviceMirror.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      /* Device chrome is fixed, never themed: the mirror shows a real phone, and a phone does
   not repaint itself when Conductor switches to light mode. */
      const CHROME = {
        dark: {
          bezel: 'oklch(16% 0.010 260)',
          screen: 'oklch(11% 0.008 262)',
          bar: 'oklch(0% 0 0 / 0.28)',
          glyph: 'oklch(100% 0 0 / 0.60)',
          text: 'oklch(88% 0.006 254)',
        },
        light: {
          bezel: 'oklch(88% 0.006 254)',
          screen: 'oklch(97% 0.003 250)',
          bar: 'oklch(100% 0 0 / 0.55)',
          glyph: 'oklch(38% 0.010 258 / 0.70)',
          text: 'oklch(30% 0.012 258)',
        },
      };

      /** Android nav bar, drawn from the vendored glyph set. */
      function NavBar({ chrome }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              height: 34,
              flex: 'none',
              background: chrome.bar,
              color: chrome.glyph,
            },
          },
          /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
            name: 'chevron-left',
            size: 15,
          }),
          /*#__PURE__*/ React.createElement('span', {
            style: {
              width: 13,
              height: 13,
              borderRadius: 'var(--radius-pill)',
              border: '1.6px solid currentColor',
            },
          }),
          /*#__PURE__*/ React.createElement('span', {
            style: {
              width: 12,
              height: 12,
              borderRadius: 2,
              border: '1.6px solid currentColor',
            },
          }),
        );
      }
      function DeviceMirror({
        children,
        width = 300,
        height = 640,
        highlight,
        highlightLabel,
        showNavBar = true,
        showStatusBar = true,
        overlay,
        onContextMenu,
        onMouseOver,
        onMouseOut,
        contentRef,
        live = true,
        deviceTheme = 'dark',
        style,
        ...rest
      }) {
        const chrome = CHROME[deviceTheme] || CHROME.dark;
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                position: 'relative',
                width,
                padding: 8,
                borderRadius: 'var(--radius-device)',
                background: chrome.bezel,
                border: 'var(--border-hair) solid var(--edge-2)',
                boxShadow: 'var(--shadow-inset-top), var(--shadow-2)',
                flex: 'none',
                ...style,
              },
            },
            rest,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              onContextMenu: onContextMenu,
              style: {
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                height,
                borderRadius: 'calc(var(--radius-device) - 8px)',
                background: chrome.screen,
                overflow: 'hidden',
                cursor: onContextMenu ? 'crosshair' : 'default',
              },
            },
            showStatusBar
              ? /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: 22,
                      padding: '0 12px',
                      flex: 'none',
                      font: 'var(--type-mono-label)',
                      color: chrome.text,
                    },
                  },
                  /*#__PURE__*/ React.createElement('span', null, '12:29'),
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      },
                    },
                    /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                      name: 'wifi',
                      size: 11,
                    }),
                    /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                      name: 'battery-medium',
                      size: 13,
                    }),
                  ),
                )
              : null,
            /*#__PURE__*/ React.createElement(
              'div',
              {
                ref: contentRef,
                onMouseOver: onMouseOver,
                onMouseOut: onMouseOut,
                style: {
                  position: 'relative',
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                },
              },
              children,
              highlight
                ? /*#__PURE__*/ React.createElement(
                    'div',
                    {
                      style: {
                        position: 'absolute',
                        left: highlight.x,
                        top: highlight.y,
                        width: highlight.width,
                        height: highlight.height,
                        borderRadius:
                          highlight.radius != null ? highlight.radius : 'var(--radius-xs)',
                        background: 'var(--device-highlight)',
                        border: 'var(--border-thick) solid var(--device-highlight-edge)',
                        boxShadow:
                          '0 0 0 1px oklch(0% 0 0 / 0.35), 0 0 18px var(--device-highlight-glow)',
                        pointerEvents: 'none',
                        transition: 'all var(--dur-fast) var(--ease-out)',
                      },
                    },
                    highlightLabel
                      ? /*#__PURE__*/ React.createElement(
                          'span',
                          {
                            style: {
                              position: 'absolute',
                              left: -1,
                              top: -19,
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 17,
                              padding: '0 5px',
                              borderRadius: 'var(--radius-xs)',
                              background: 'var(--device-highlight-edge)',
                              color: 'var(--ink-1000)',
                              font: 'var(--type-mono-label)',
                              whiteSpace: 'nowrap',
                            },
                          },
                          highlightLabel,
                        )
                      : null,
                  )
                : null,
              overlay,
            ),
            showNavBar
              ? /*#__PURE__*/ React.createElement(NavBar, {
                  chrome: chrome,
                })
              : null,
            !live
              ? /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'oklch(0% 0 0 / 0.55)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                    },
                  },
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        font: 'var(--type-caption)',
                        color: 'oklch(72% 0.010 252)',
                      },
                    },
                    'Mirror paused',
                  ),
                )
              : null,
          ),
        );
      }
      Object.assign(__ds_scope, { DeviceMirror });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/DeviceMirror.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/DeviceSelector.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function DeviceSelector({
        device,
        platform = 'Android',
        state = 'connected',
        onClick,
        style,
        ...rest
      }) {
        const [hover, setHover] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          'button',
          _extends(
            {
              type: 'button',
              onClick: onClick,
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => setHover(false),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                width: '100%',
                height: 'var(--control-h-lg)',
                padding: '0 var(--space-4) 0 var(--space-5)',
                borderRadius: 'var(--radius-md)',
                background: hover ? 'var(--glass-2)' : 'var(--glass-1)',
                border:
                  'var(--border-hair) solid ' + (hover ? 'var(--edge-strong)' : 'var(--edge-2)'),
                boxShadow: 'var(--shadow-inset-top)',
                cursor: 'pointer',
                transition: 'var(--t-hover)',
                ...style,
              },
            },
            rest,
          ),
          /*#__PURE__*/ React.createElement(__ds_scope.StatusDot, {
            state: state,
            size: 7,
            pulse: state === 'running',
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--space-3)',
                flex: 1,
                minWidth: 0,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-code-sm)',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              device,
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-caption)',
                  color: 'var(--text-tertiary)',
                  flex: 'none',
                },
              },
              '\xB7 ',
              platform,
            ),
          ),
          /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
            name: 'chevrons-up-down',
            size: 13,
            color: 'var(--text-tertiary)',
          }),
        );
      }
      Object.assign(__ds_scope, { DeviceSelector });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/DeviceSelector.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/FileTree.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Node({ node, depth, expanded, selectedId, onToggle, onSelect }) {
        const [hover, setHover] = React.useState(false);
        const isDir = node.type === 'dir';
        const open = !!expanded[node.id];
        const on = node.id === selectedId;
        return /*#__PURE__*/ React.createElement(
          React.Fragment,
          null,
          /*#__PURE__*/ React.createElement(
            'div',
            {
              onClick: () => (isDir ? onToggle(node.id) : onSelect && onSelect(node.id)),
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => setHover(false),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                height: 'var(--row-h)',
                paddingLeft: 8 + depth * 14,
                paddingRight: 8,
                borderRadius: 'var(--radius-xs)',
                background: on
                  ? 'var(--glass-selected)'
                  : hover
                    ? 'var(--glass-hover)'
                    : 'transparent',
                color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background-color var(--dur-instant) var(--ease-out)',
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  width: 12,
                  display: 'grid',
                  placeItems: 'center',
                  flex: 'none',
                  color: 'var(--text-disabled)',
                },
              },
              isDir
                ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                    name: open ? 'chevron-down' : 'chevron-right',
                    size: 12,
                  })
                : null,
            ),
            /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
              name: isDir ? (open ? 'folder-open' : 'folder') : node.icon || 'file-code',
              size: 13,
              color: isDir ? 'var(--text-tertiary)' : on ? 'var(--accent)' : 'var(--text-disabled)',
            }),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-code-sm)',
                  letterSpacing: 'var(--ls-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              node.name,
            ),
            node.badge
              ? /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      marginLeft: 'auto',
                      font: 'var(--type-mono-label)',
                      color: 'var(--text-disabled)',
                    },
                  },
                  node.badge,
                )
              : null,
          ),
          isDir && open && node.children
            ? node.children.map((c) =>
                /*#__PURE__*/ React.createElement(Node, {
                  key: c.id,
                  node: c,
                  depth: depth + 1,
                  expanded: expanded,
                  selectedId: selectedId,
                  onToggle: onToggle,
                  onSelect: onSelect,
                }),
              )
            : null,
        );
      }
      function FileTree({
        nodes = [],
        selectedId,
        defaultExpanded = [],
        onSelect,
        style,
        ...rest
      }) {
        const [expanded, setExpanded] = React.useState(() =>
          Object.fromEntries(defaultExpanded.map((id) => [id, true])),
        );
        const toggle = (id) =>
          setExpanded((e) => ({
            ...e,
            [id]: !e[id],
          }));
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'grid',
                alignContent: 'start',
                gap: 1,
                padding: 'var(--space-3)',
                overflow: 'auto',
                ...style,
              },
            },
            rest,
          ),
          nodes.map((n) =>
            /*#__PURE__*/ React.createElement(Node, {
              key: n.id,
              node: n,
              depth: 0,
              expanded: expanded,
              selectedId: selectedId,
              onToggle: toggle,
              onSelect: onSelect,
            }),
          ),
        );
      }
      Object.assign(__ds_scope, { FileTree });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/FileTree.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/LogStream.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const ICONS = {
        pass: 'circle-check',
        fail: 'triangle-alert',
        running: 'loader-circle',
        skipped: 'minus',
        info: 'info',
      };
      const TINTS = {
        pass: 'var(--state-pass)',
        fail: 'var(--state-fail)',
        running: 'var(--state-running)',
        skipped: 'var(--text-disabled)',
        info: 'var(--text-tertiary)',
      };
      function Entry({ run, onSelect, selected }) {
        const [hover, setHover] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            onClick: () => onSelect && onSelect(run.id),
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-5)',
              height: 'var(--row-h-lg)',
              padding: '0 var(--space-6)',
              background: selected
                ? 'var(--glass-selected)'
                : hover
                  ? 'var(--glass-hover)'
                  : 'transparent',
              cursor: 'pointer',
              transition: 'background-color var(--dur-instant) var(--ease-out)',
            },
          },
          /*#__PURE__*/ React.createElement(__ds_scope.StatusDot, {
            state: run.status === 'skipped' ? 'idle' : run.status,
            size: 7,
            pulse: run.status === 'running',
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-mono-label)',
                color: 'var(--text-tertiary)',
                flex: 'none',
              },
            },
            run.startedAt,
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-body-strong)',
                color: 'var(--text-primary)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            },
            run.flow,
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                font: 'var(--type-mono-label)',
                color: TINTS[run.status],
              },
            },
            /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
              name: ICONS[run.status] || 'info',
              size: 12,
            }),
            run.duration,
          ),
        );
      }
      function Step({ step }) {
        const [open, setOpen] = React.useState(!!step.detail);
        const tint = TINTS[step.status] || TINTS.info;
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              borderTop: 'var(--border-hair) solid var(--edge-1)',
              background: step.status === 'fail' ? 'var(--state-fail-quiet)' : 'transparent',
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              onClick: () => step.detail && setOpen(!open),
              style: {
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-5)',
                minHeight: 'var(--row-h-lg)',
                padding: '7px var(--space-6)',
                cursor: step.detail ? 'pointer' : 'default',
              },
            },
            /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
              name: ICONS[step.status] || 'info',
              size: 13,
              color: tint,
              style: {
                marginTop: 2,
                animation: step.status === 'running' ? 'cd-spin 700ms linear infinite' : undefined,
              },
            }),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  flex: 1,
                  display: 'grid',
                  gap: 3,
                  minWidth: 0,
                },
              },
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-body)',
                    color: step.status === 'fail' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  },
                },
                step.label,
              ),
              open && step.detail
                ? /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        font: 'var(--type-code-sm)',
                        color: tint,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      },
                    },
                    step.detail,
                  )
                : null,
            ),
            step.duration
              ? /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-mono-label)',
                      color: 'var(--text-disabled)',
                      flex: 'none',
                      marginTop: 2,
                    },
                  },
                  step.duration,
                )
              : null,
          ),
        );
      }
      function LogStream({
        runs = [],
        steps = [],
        selectedRunId,
        onSelectRun,
        footer,
        style,
        ...rest
      }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                height: '100%',
                ...style,
              },
            },
            rest,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                overflow: 'auto',
                minHeight: 0,
                flex: 1,
              },
            },
            runs.map((r) =>
              /*#__PURE__*/ React.createElement(
                React.Fragment,
                {
                  key: r.id,
                },
                /*#__PURE__*/ React.createElement(Entry, {
                  run: r,
                  onSelect: onSelectRun,
                  selected: r.id === selectedRunId,
                }),
                r.id === selectedRunId
                  ? steps.map((s, i) =>
                      /*#__PURE__*/ React.createElement(Step, {
                        key: s.id || i,
                        step: s,
                      }),
                    )
                  : null,
              ),
            ),
          ),
          footer,
        );
      }
      Object.assign(__ds_scope, { LogStream });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/LogStream.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/RunBar.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function RunBar({
        env,
        envOptions = [],
        onEnvChange,
        running = false,
        onRun,
        onRunAll,
        onStop,
        extra,
        style,
        ...rest
      }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-5)',
                height: 'var(--toolbar-h)',
                padding: '0 var(--space-5)',
                flex: 'none',
                borderTop: 'var(--border-hair) solid var(--edge-1)',
                borderBottom: 'var(--border-hair) solid var(--edge-1)',
                ...style,
              },
            },
            rest,
          ),
          extra,
          /*#__PURE__*/ React.createElement('span', {
            style: {
              flex: 1,
            },
          }),
          envOptions.length
            ? /*#__PURE__*/ React.createElement(__ds_scope.Select, {
                size: 'sm',
                icon: 'variable',
                value: env,
                options: envOptions,
                onChange: onEnvChange,
              })
            : null,
          running
            ? /*#__PURE__*/ React.createElement(
                __ds_scope.Button,
                {
                  variant: 'danger',
                  icon: 'circle-stop',
                  onClick: onStop,
                },
                'Stop',
              )
            : /*#__PURE__*/ React.createElement(
                __ds_scope.Button,
                {
                  variant: 'primary',
                  icon: 'play',
                  onClick: onRun,
                },
                'Run Test',
              ),
          onRunAll
            ? /*#__PURE__*/ React.createElement(
                __ds_scope.Button,
                {
                  icon: 'list-checks',
                  onClick: onRunAll,
                  disabled: running,
                },
                'Run All Tests',
              )
            : null,
          /*#__PURE__*/ React.createElement(__ds_scope.IconButton, {
            icon: 'chevron-down',
            label: 'Run options',
            size: 'md',
            variant: 'glass',
          }),
        );
      }
      Object.assign(__ds_scope, { RunBar });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/RunBar.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/TestList.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const COLS = '26px 14px 1fr 62px 116px 52px 28px';
      function Row({ test, selected, checked, onOpen, onSelect, onCheck, onAction }) {
        const [hover, setHover] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            onClick: () => onSelect && onSelect(test.id),
            onDoubleClick: () => onOpen && onOpen(test.id),
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            style: {
              display: 'grid',
              gridTemplateColumns: COLS,
              alignItems: 'center',
              gap: 'var(--space-4)',
              height: 'var(--row-h-lg)',
              padding: '0 var(--space-6)',
              background: selected
                ? 'var(--glass-selected)'
                : hover
                  ? 'var(--glass-hover)'
                  : 'transparent',
              cursor: 'default',
              transition: 'background-color var(--dur-instant) var(--ease-out)',
            },
          },
          /*#__PURE__*/ React.createElement(__ds_scope.Checkbox, {
            checked: !!checked,
            onChange: () => onCheck && onCheck(test.id),
            style: {
              pointerEvents: 'auto',
            },
          }),
          /*#__PURE__*/ React.createElement(__ds_scope.StatusDot, {
            state: test.lastResult === 'never' ? 'idle' : test.lastResult,
            size: 7,
            pulse: test.lastResult === 'running',
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                minWidth: 0,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-code-sm)',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              test.name,
            ),
            test.open
              ? /*#__PURE__*/ React.createElement('span', {
                  title: 'Open in the editor',
                  style: {
                    width: 5,
                    height: 5,
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--accent)',
                    flex: 'none',
                  },
                })
              : null,
            test.aiAuthored
              ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                  name: 'sparkles',
                  size: 11,
                  color: 'var(--text-ai)',
                  title: 'Drafted by Conductor',
                })
              : null,
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-mono-label)',
                color: 'var(--text-tertiary)',
                textAlign: 'right',
              },
            },
            test.steps,
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-mono-label)',
                color:
                  test.lastResult === 'never' ? 'var(--text-disabled)' : 'var(--text-tertiary)',
              },
            },
            test.lastResult === 'never' ? 'never run' : test.lastRun,
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-mono-label)',
                color: test.lastResult === 'fail' ? 'var(--state-fail)' : 'var(--text-tertiary)',
                textAlign: 'right',
              },
            },
            test.duration || '—',
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                opacity: hover || selected ? 1 : 0,
                transition: 'opacity var(--dur-fast) var(--ease-out)',
              },
            },
            /*#__PURE__*/ React.createElement(__ds_scope.IconButton, {
              icon: 'ellipsis',
              label: 'Actions for ' + test.name,
              size: 'sm',
              onClick: (e) => {
                e.stopPropagation();
                onAction && onAction(test.id, e);
              },
            }),
          ),
        );
      }
      function TestList({
        tests = [],
        selectedId,
        checkedIds = [],
        onOpen,
        onSelect,
        onCheck,
        onCheckAll,
        onAction,
        emptyState,
        style,
        ...rest
      }) {
        const allChecked = tests.length > 0 && checkedIds.length === tests.length;
        if (!tests.length && emptyState)
          return /*#__PURE__*/ React.createElement(
            'div',
            _extends(
              {
                style: {
                  display: 'grid',
                  minHeight: 0,
                  ...style,
                },
              },
              rest,
            ),
            emptyState,
          );
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                ...style,
              },
            },
            rest,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gridTemplateColumns: COLS,
                alignItems: 'center',
                gap: 'var(--space-4)',
                height: 'var(--row-h)',
                padding: '0 var(--space-6)',
                flex: 'none',
                borderBottom: 'var(--border-hair) solid var(--edge-1)',
                font: 'var(--type-mono-label)',
                color: 'var(--text-disabled)',
              },
            },
            /*#__PURE__*/ React.createElement(__ds_scope.Checkbox, {
              checked: allChecked,
              onChange: () => onCheckAll && onCheckAll(allChecked ? [] : tests.map((t) => t.id)),
            }),
            /*#__PURE__*/ React.createElement('span', null),
            /*#__PURE__*/ React.createElement('span', null, 'flow'),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  textAlign: 'right',
                },
              },
              'steps',
            ),
            /*#__PURE__*/ React.createElement('span', null, 'last run'),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  textAlign: 'right',
                },
              },
              'time',
            ),
            /*#__PURE__*/ React.createElement('span', null),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                overflow: 'auto',
                minHeight: 0,
                flex: 1,
              },
            },
            tests.map((t) =>
              /*#__PURE__*/ React.createElement(Row, {
                key: t.id,
                test: t,
                selected: t.id === selectedId,
                checked: checkedIds.includes(t.id),
                onOpen: onOpen,
                onSelect: onSelect,
                onCheck: onCheck,
                onAction: onAction,
              }),
            ),
          ),
        );
      }
      Object.assign(__ds_scope, { TestList });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/TestList.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/TitleBar.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const LIGHTS = [
        {
          key: 'close',
          fill: 'oklch(65% 0.190 22)',
          glyph: 'M3 3l4 4M7 3l-4 4',
        },
        {
          key: 'minimise',
          fill: 'oklch(80% 0.150 85)',
          glyph: 'M2.5 5h5',
        },
        {
          key: 'zoom',
          fill: 'oklch(72% 0.165 145)',
          glyph: 'M3 5h4M5 3v4',
        },
      ];
      function TitleBar({
        projectPath,
        leading,
        center,
        actions,
        showTrafficLights = true,
        style,
        ...rest
      }) {
        const [hover, setHover] = React.useState(false);
        const [lightsLive, setLightsLive] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              onMouseEnter: () => setLightsLive(true),
              onMouseLeave: () => setLightsLive(false),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-5)',
                height: 'var(--titlebar-h)',
                padding: '0 var(--space-5)',
                flex: 'none',
                borderBottom: 'var(--border-hair) solid var(--edge-1)',
                WebkitAppRegion: 'drag',
                ...style,
              },
            },
            rest,
          ),
          showTrafficLights
            ? /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flex: 'none',
                    WebkitAppRegion: 'no-drag',
                  },
                },
                LIGHTS.map((l) =>
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      key: l.key,
                      'aria-label': l.key,
                      style: {
                        display: 'grid',
                        placeItems: 'center',
                        width: 12,
                        height: 12,
                        borderRadius: 'var(--radius-pill)',
                        background: lightsLive ? l.fill : 'oklch(100% 0 0 / 0.16)',
                        boxShadow: lightsLive ? 'inset 0 0 0 0.5px oklch(0% 0 0 / 0.18)' : 'none',
                        transition: 'background var(--dur-fast) var(--ease-out)',
                      },
                    },
                    /*#__PURE__*/ React.createElement(
                      'svg',
                      {
                        width: '10',
                        height: '10',
                        viewBox: '0 0 10 10',
                        style: {
                          opacity: lightsLive ? 0.55 : 0,
                          transition: 'opacity var(--dur-fast) var(--ease-out)',
                        },
                      },
                      /*#__PURE__*/ React.createElement('path', {
                        d: l.glyph,
                        stroke: 'oklch(18% 0.010 265)',
                        strokeWidth: '1.3',
                        strokeLinecap: 'round',
                        fill: 'none',
                      }),
                    ),
                  ),
                ),
              )
            : null,
          leading
            ? /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    flex: 'none',
                    WebkitAppRegion: 'no-drag',
                  },
                },
                leading,
              )
            : null,
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                flex: '1 1 auto',
                minWidth: 0,
                display: 'grid',
                justifyContent: 'center',
                WebkitAppRegion: 'no-drag',
              },
            },
            center,
            !center && projectPath
              ? /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    onMouseEnter: () => setHover(true),
                    onMouseLeave: () => setHover(false),
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifySelf: 'center',
                      gap: 'var(--space-3)',
                      minWidth: 0,
                      height: 24,
                      padding: '0 var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      background: hover ? 'var(--glass-hover)' : 'transparent',
                      transition: 'var(--t-hover)',
                      cursor: 'pointer',
                    },
                  },
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        font: 'var(--type-code-sm)',
                        color: 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        direction: 'rtl',
                        textAlign: 'left',
                      },
                    },
                    projectPath,
                  ),
                  /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                    name: 'chevron-down',
                    size: 12,
                    color: 'var(--text-disabled)',
                  }),
                )
              : null,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flex: 'none',
                WebkitAppRegion: 'no-drag',
              },
            },
            actions,
          ),
        );
      }
      Object.assign(__ds_scope, { TitleBar });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/TitleBar.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/studio/YamlEditor.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const KEYWORDS = /^(appId|tags|env|onFlowStart|onFlowComplete|name)$/;
      function tokenize(line) {
        const out = [];
        const push = (t, v) =>
          v &&
          out.push({
            t,
            v,
          });
        const commentAt = line.indexOf('#');
        let body = line;
        let comment = '';
        if (commentAt >= 0) {
          body = line.slice(0, commentAt);
          comment = line.slice(commentAt);
        }
        const doc = body.match(/^\s*---\s*$/);
        if (doc) {
          push('punct', body);
          push('comment', comment);
          return out;
        }
        const m = body.match(/^(\s*)(-\s*)?([A-Za-z_][\w.-]*)(:)(.*)$/);
        if (m) {
          push('plain', m[1]);
          push('dash', m[2]);
          push(KEYWORDS.test(m[3]) ? 'anchor' : 'key', m[3]);
          push('punct', m[4]);
          const rest = m[5];
          if (rest) {
            if (/^\s*(true|false|null|\d+(\.\d+)?)\s*$/.test(rest)) push('number', rest);
            else push('string', rest);
          }
        } else {
          const d = body.match(/^(\s*)(-\s*)(.*)$/);
          if (d) {
            push('plain', d[1]);
            push('dash', d[2]);
            push('string', d[3]);
          } else push('plain', body);
        }
        push('comment', comment);
        return out;
      }
      const COLORS = {
        key: 'var(--syn-key)',
        anchor: 'var(--syn-anchor)',
        string: 'var(--syn-string)',
        number: 'var(--syn-number)',
        punct: 'var(--syn-punct)',
        dash: 'var(--syn-punct)',
        comment: 'var(--syn-comment)',
        plain: 'var(--text-primary)',
      };
      function YamlEditor({
        value = '',
        activeLine,
        errorLines = [],
        aiLines = [],
        showGutter = true,
        padding = 'var(--space-5) 0',
        onLineClick,
        style,
        ...rest
      }) {
        const lines = value.replace(/\n$/, '').split('\n');
        const total = Math.max(lines.length + 1, 1);
        const width = String(total).length;
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                position: 'relative',
                height: '100%',
                overflow: 'auto',
                background: 'var(--editor-bg)',
                padding,
                font: 'var(--type-code)',
                letterSpacing: 'var(--ls-mono)',
                tabSize: 2,
                ...style,
              },
            },
            rest,
          ),
          Array.from(
            {
              length: total,
            },
            (_, i) => {
              const n = i + 1;
              const text = lines[i] != null ? lines[i] : '';
              const isActive = n === activeLine;
              const isError = errorLines.includes(n);
              const isAi = aiLines.includes(n);
              return /*#__PURE__*/ React.createElement(
                'div',
                {
                  key: n,
                  onClick: () => onLineClick && onLineClick(n),
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-5)',
                    minHeight: 'calc(var(--size-13) * var(--lh-code))',
                    padding: '0 var(--space-6) 0 var(--space-5)',
                    background: isError
                      ? 'var(--state-fail-quiet)'
                      : isAi
                        ? 'var(--ai-quiet)'
                        : isActive
                          ? 'var(--editor-active-line)'
                          : 'transparent',
                    boxShadow: isAi
                      ? 'inset 2px 0 0 0 var(--ai)'
                      : isError
                        ? 'inset 2px 0 0 0 var(--state-fail)'
                        : 'none',
                    cursor: onLineClick ? 'text' : 'default',
                  },
                },
                showGutter
                  ? /*#__PURE__*/ React.createElement(
                      'span',
                      {
                        style: {
                          flex: 'none',
                          width: width + 'ch',
                          textAlign: 'right',
                          color: isActive ? 'var(--text-secondary)' : 'var(--editor-gutter)',
                          userSelect: 'none',
                        },
                      },
                      n,
                    )
                  : null,
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      minWidth: 0,
                    },
                  },
                  tokenize(text).map((tk, j) =>
                    /*#__PURE__*/ React.createElement(
                      'span',
                      {
                        key: j,
                        style: {
                          color: COLORS[tk.t],
                        },
                      },
                      tk.v,
                    ),
                  ),
                  isActive
                    ? /*#__PURE__*/ React.createElement('span', {
                        style: {
                          display: 'inline-block',
                          width: 1.5,
                          height: '1.05em',
                          marginLeft: 1,
                          verticalAlign: 'text-bottom',
                          background: 'var(--editor-caret)',
                          animation: 'cd-caret 1s steps(1) infinite',
                        },
                      })
                    : null,
                ),
              );
            },
          ),
        );
      }
      Object.assign(__ds_scope, { YamlEditor });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/studio/YamlEditor.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/surface/ContextMenu.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Row({ item, onSelect }) {
        const [hover, setHover] = React.useState(false);
        if (item.type === 'separator')
          return /*#__PURE__*/ React.createElement('div', {
            style: {
              height: 1,
              margin: '4px 6px',
              background: 'var(--edge-1)',
            },
          });
        if (item.type === 'label')
          return /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                padding: '6px 10px 3px',
                font: 'var(--type-label)',
                letterSpacing: 'var(--ls-caps)',
                textTransform: 'uppercase',
                color: 'var(--text-disabled)',
              },
            },
            item.label,
          );
        const off = item.disabled;
        const tint = item.destructive
          ? 'var(--state-fail)'
          : item.ai
            ? 'var(--text-ai)'
            : 'var(--text-primary)';
        return /*#__PURE__*/ React.createElement(
          'button',
          {
            type: 'button',
            disabled: off,
            onClick: () => !off && onSelect && onSelect(item),
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              width: '100%',
              height: 'var(--row-h)',
              padding: '0 8px',
              borderRadius: 'var(--radius-xs)',
              border: 'none',
              /* AppKit highlights a menu row with a solid accent fill, not a tint — the row goes
         accent and its text goes white. Destructive and AI rows keep their own hue. */
              background:
                hover && !off
                  ? item.destructive
                    ? 'var(--state-fail)'
                    : item.ai
                      ? 'var(--ai)'
                      : 'var(--accent)'
                  : 'transparent',
              color: hover && !off ? 'var(--accent-on)' : tint,
              font: 'var(--type-body)',
              textAlign: 'left',
              cursor: off ? 'not-allowed' : 'pointer',
              opacity: off ? 0.4 : 1,
              transition: 'background-color var(--dur-instant) var(--ease-out)',
            },
          },
          item.icon
            ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: item.icon,
                size: 14,
                color:
                  hover && !off
                    ? 'var(--accent-on)'
                    : item.destructive || item.ai
                      ? tint
                      : 'var(--text-tertiary)',
              })
            : /*#__PURE__*/ React.createElement('span', {
                style: {
                  width: 14,
                },
              }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                flex: 1,
                whiteSpace: 'nowrap',
                font: item.mono ? 'var(--type-code-sm)' : undefined,
              },
            },
            item.label,
          ),
          item.shortcut
            ? /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-mono-label)',
                    color: hover && !off ? 'oklch(100% 0 0 / 0.70)' : 'var(--text-disabled)',
                  },
                },
                item.shortcut,
              )
            : null,
          item.submenu
            ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: 'chevron-right',
                size: 12,
                color: hover && !off ? 'var(--accent-on)' : 'var(--text-disabled)',
              })
            : null,
        );
      }
      function ContextMenu({ items = [], x, y, width = 232, title, onSelect, style, ...rest }) {
        const positioned = x != null && y != null;
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              role: 'menu',
              style: {
                position: positioned ? 'fixed' : 'relative',
                left: positioned ? x : undefined,
                top: positioned ? y : undefined,
                zIndex: 80,
                width,
                padding: 4,
                borderRadius: 'var(--radius-md)',
                background: 'var(--glass-3)',
                backdropFilter: 'blur(var(--blur-3)) saturate(var(--saturate-vibrant))',
                WebkitBackdropFilter: 'blur(var(--blur-3)) saturate(var(--saturate-vibrant))',
                border: 'var(--border-hair) solid var(--edge-2)',
                boxShadow: 'var(--shadow-inset-top), var(--shadow-3)',
                animation: 'cd-menu-in var(--dur-base) var(--ease-spring)',
                transformOrigin: 'top left',
                ...style,
              },
            },
            rest,
          ),
          title
            ? /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: '5px 8px 7px',
                    borderBottom: 'var(--border-hair) solid var(--edge-1)',
                    marginBottom: 4,
                  },
                },
                /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                  name: 'crosshair',
                  size: 12,
                  color: 'var(--accent)',
                }),
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-code-sm)',
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  },
                  title,
                ),
              )
            : null,
          items.map((item, i) =>
            /*#__PURE__*/ React.createElement(Row, {
              key: item.id || i,
              item: item,
              onSelect: onSelect,
            }),
          ),
        );
      }
      Object.assign(__ds_scope, { ContextMenu });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/surface/ContextMenu.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/surface/Dialog.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Dialog({
        open = true,
        title,
        subtitle,
        icon,
        children,
        footer,
        width = 460,
        onClose,
        style,
        ...rest
      }) {
        if (!open) return null;
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              position: 'absolute',
              inset: 0,
              zIndex: 90,
              display: 'grid',
              placeItems: 'center',
              padding: 'var(--space-8)',
              background: 'oklch(0% 0 0 / 0.34)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              animation: 'cd-fade-in var(--dur-base) var(--ease-out)',
            },
            onClick: onClose,
          },
          /*#__PURE__*/ React.createElement(
            'div',
            _extends(
              {
                role: 'dialog',
                'aria-modal': 'true',
                onClick: (e) => e.stopPropagation(),
                style: {
                  width,
                  maxWidth: '100%',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--glass-3)',
                  backdropFilter: 'blur(var(--blur-heavy)) saturate(var(--saturate-glass))',
                  WebkitBackdropFilter: 'blur(var(--blur-heavy)) saturate(var(--saturate-glass))',
                  border: 'var(--border-hair) solid var(--edge-2)',
                  boxShadow: 'var(--shadow-inset-top), var(--shadow-3)',
                  animation: 'cd-dialog-in var(--dur-slow) var(--ease-glass)',
                  overflow: 'hidden',
                  ...style,
                },
              },
              rest,
            ),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-5)',
                  padding: 'var(--space-6) var(--space-6) var(--space-5)',
                },
              },
              icon
                ? /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        display: 'grid',
                        placeItems: 'center',
                        width: 32,
                        height: 32,
                        flex: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent-quiet)',
                        color: 'var(--accent)',
                      },
                    },
                    /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                      name: icon,
                      size: 16,
                    }),
                  )
                : null,
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    flex: 1,
                    display: 'grid',
                    gap: 3,
                    minWidth: 0,
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'h2',
                  {
                    style: {
                      font: 'var(--type-title-3)',
                      color: 'var(--text-primary)',
                    },
                  },
                  title,
                ),
                subtitle
                  ? /*#__PURE__*/ React.createElement(
                      'p',
                      {
                        style: {
                          font: 'var(--type-body)',
                          color: 'var(--text-secondary)',
                        },
                      },
                      subtitle,
                    )
                  : null,
              ),
              onClose
                ? /*#__PURE__*/ React.createElement(__ds_scope.IconButton, {
                    icon: 'x',
                    label: 'Close',
                    size: 'sm',
                    onClick: onClose,
                  })
                : null,
            ),
            children
              ? /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      padding: '0 var(--space-6) var(--space-6)',
                    },
                  },
                  children,
                )
              : null,
            footer
              ? /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 'var(--space-4)',
                      padding: 'var(--space-5) var(--space-6)',
                      borderTop: 'var(--border-hair) solid var(--edge-1)',
                      background: 'var(--glass-sunken)',
                    },
                  },
                  footer,
                )
              : null,
          ),
        );
      }
      Object.assign(__ds_scope, { Dialog });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/surface/Dialog.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/surface/Divider.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Divider({
        orientation = 'horizontal',
        label,
        spacing = 'var(--space-5)',
        style,
        ...rest
      }) {
        if (label) {
          return /*#__PURE__*/ React.createElement(
            'div',
            _extends(
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  margin: spacing + ' 0',
                  ...style,
                },
              },
              rest,
            ),
            /*#__PURE__*/ React.createElement('span', {
              style: {
                height: 1,
                flex: 1,
                background: 'var(--edge-1)',
              },
            }),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-label)',
                  letterSpacing: 'var(--ls-caps)',
                  textTransform: 'uppercase',
                  color: 'var(--text-disabled)',
                  whiteSpace: 'nowrap',
                },
              },
              label,
            ),
            /*#__PURE__*/ React.createElement('span', {
              style: {
                height: 1,
                flex: 1,
                background: 'var(--edge-1)',
              },
            }),
          );
        }
        const vertical = orientation === 'vertical';
        return /*#__PURE__*/ React.createElement(
          'span',
          _extends(
            {
              'aria-hidden': 'true',
              style: {
                flex: 'none',
                width: vertical ? 1 : 'auto',
                height: vertical ? '60%' : 1,
                alignSelf: vertical ? 'center' : undefined,
                margin: vertical ? '0 ' + spacing : spacing + ' 0',
                background: 'var(--edge-1)',
                ...style,
              },
            },
            rest,
          ),
        );
      }
      Object.assign(__ds_scope, { Divider });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/surface/Divider.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/surface/EmptyState.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function EmptyState({
        icon = 'layers',
        title,
        description,
        action,
        size = 'md',
        style,
        ...rest
      }) {
        const sm = size === 'sm';
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'grid',
                placeItems: 'center',
                alignContent: 'center',
                gap: sm ? 'var(--space-4)' : 'var(--space-5)',
                height: '100%',
                padding: 'var(--space-8)',
                textAlign: 'center',
                ...style,
              },
            },
            rest,
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'grid',
                placeItems: 'center',
                width: sm ? 34 : 44,
                height: sm ? 34 : 44,
                borderRadius: 'var(--radius-md)',
                background: 'var(--glass-1)',
                border: 'var(--border-hair) solid var(--edge-1)',
                boxShadow: 'var(--shadow-inset-top)',
                color: 'var(--text-tertiary)',
              },
            },
            /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
              name: icon,
              size: sm ? 16 : 20,
            }),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gap: 4,
                maxWidth: 300,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: sm ? 'var(--type-body-strong)' : 'var(--type-title-3)',
                  color: 'var(--text-secondary)',
                },
              },
              title,
            ),
            description
              ? /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-caption)',
                      color: 'var(--text-tertiary)',
                      textWrap: 'pretty',
                    },
                  },
                  description,
                )
              : null,
          ),
          action,
        );
      }
      Object.assign(__ds_scope, { EmptyState });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/surface/EmptyState.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/surface/GlassPanel.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const BLUR = {
        1: 'var(--blur-1)',
        2: 'var(--blur-2)',
        3: 'var(--blur-3)',
      };
      const FILL = {
        1: 'var(--glass-1)',
        2: 'var(--glass-2)',
        3: 'var(--glass-3)',
      };
      /* AppKit's two materials. `vibrant` for chrome the desktop shows through (sidebars, toolbars);
   `content` for regions holding text that must sit still (editors, logs). */
      const MATERIAL = {
        vibrant: {
          background: 'var(--material-vibrant)',
          blur: 'var(--blur-2)',
          saturate: 'var(--saturate-vibrant)',
        },
        content: {
          background: 'var(--material-content)',
          blur: 'var(--blur-1)',
          saturate: '120%',
        },
      };
      const SHADOW = {
        1: 'var(--shadow-inset-top)',
        2: 'var(--shadow-inset-top), var(--shadow-1)',
        3: 'var(--shadow-inset-top), var(--shadow-3)',
      };
      function GlassPanel({
        children,
        depth = 1,
        radius = 'lg',
        padding,
        sunken = false,
        sheen = false,
        material,
        as: Tag = 'div',
        style,
        ...rest
      }) {
        const r = 'var(--radius-' + radius + ')';
        const m = MATERIAL[material];
        const base = sunken
          ? {
              background: 'var(--glass-sunken)',
              border: 'var(--border-hair) solid var(--edge-sunken)',
              boxShadow: 'var(--shadow-inset-sunken)',
            }
          : m
            ? {
                background: m.background,
                backdropFilter: 'blur(' + m.blur + ') saturate(' + m.saturate + ')',
                WebkitBackdropFilter: 'blur(' + m.blur + ') saturate(' + m.saturate + ')',
                border:
                  'var(--border-hair) solid ' + (depth === 1 ? 'var(--edge-1)' : 'var(--edge-2)'),
                boxShadow: SHADOW[depth],
              }
            : {
                background: FILL[depth],
                backdropFilter: 'blur(' + BLUR[depth] + ') saturate(var(--saturate-glass))',
                WebkitBackdropFilter: 'blur(' + BLUR[depth] + ') saturate(var(--saturate-glass))',
                border:
                  'var(--border-hair) solid ' + (depth === 1 ? 'var(--edge-1)' : 'var(--edge-2)'),
                boxShadow: SHADOW[depth],
              };
        return /*#__PURE__*/ React.createElement(
          Tag,
          _extends(
            {
              style: {
                position: 'relative',
                borderRadius: r,
                padding: padding,
                minWidth: 0,
                minHeight: 0,
                ...base,
                ...style,
              },
            },
            rest,
          ),
          sheen && !sunken
            ? /*#__PURE__*/ React.createElement('span', {
                'aria-hidden': 'true',
                style: {
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'inherit',
                  padding: 1,
                  background:
                    'linear-gradient(160deg, var(--specular), transparent 38%, transparent 62%, var(--edge-1))',
                  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                  WebkitMaskComposite: 'xor',
                  mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                  maskComposite: 'exclude',
                  pointerEvents: 'none',
                },
              })
            : null,
          children,
        );
      }
      Object.assign(__ds_scope, { GlassPanel });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/surface/GlassPanel.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/surface/PanelHeader.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function PanelHeader({
        icon,
        title,
        meta,
        actions,
        dense = false,
        divider = true,
        style,
        ...rest
      }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                height: dense ? 32 : 'var(--toolbar-h)',
                padding: dense ? '0 var(--space-4) 0 var(--space-5)' : '0 var(--space-5)',
                borderBottom: divider ? 'var(--border-hair) solid var(--edge-1)' : 'none',
                flex: 'none',
                ...style,
              },
            },
            rest,
          ),
          icon
            ? /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: icon,
                size: 14,
                color: 'var(--text-tertiary)',
              })
            : null,
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-label)',
                letterSpacing: 'var(--ls-caps)',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                whiteSpace: 'nowrap',
              },
            },
            title,
          ),
          meta
            ? /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-mono-label)',
                    color: 'var(--text-disabled)',
                    whiteSpace: 'nowrap',
                  },
                },
                meta,
              )
            : null,
          /*#__PURE__*/ React.createElement('span', {
            style: {
              flex: 1,
            },
          }),
          actions
            ? /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  },
                },
                actions,
              )
            : null,
        );
      }
      Object.assign(__ds_scope, { PanelHeader });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/surface/PanelHeader.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/surface/TabStrip.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function TabStrip({ tabs = [], activeId, onSelect, onClose, onAdd, style, ...rest }) {
        const [hoverId, setHoverId] = React.useState(null);
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              role: 'tablist',
              style: {
                display: 'flex',
                alignItems: 'stretch',
                gap: 2,
                height: 34,
                padding: '0 var(--space-3)',
                borderBottom: 'var(--border-hair) solid var(--edge-1)',
                flex: 'none',
                ...style,
              },
            },
            rest,
          ),
          tabs.map((t) => {
            const on = t.id === activeId;
            const hot = hoverId === t.id;
            return /*#__PURE__*/ React.createElement(
              'div',
              {
                key: t.id,
                role: 'tab',
                'aria-selected': on,
                onClick: () => onSelect && onSelect(t.id),
                onMouseEnter: () => setHoverId(t.id),
                onMouseLeave: () => setHoverId(null),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  alignSelf: 'center',
                  height: 26,
                  padding: '0 var(--space-3) 0 var(--space-4)',
                  borderRadius: 'var(--radius-xs)',
                  background: on ? 'var(--glass-2)' : hot ? 'var(--glass-hover)' : 'transparent',
                  border: 'var(--border-hair) solid ' + (on ? 'var(--edge-2)' : 'transparent'),
                  boxShadow: on ? 'var(--shadow-inset-top)' : 'none',
                  color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  cursor: 'pointer',
                  transition: 'var(--t-hover)',
                },
              },
              /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                name: t.icon || 'file-code',
                size: 13,
                color: on ? 'var(--accent)' : 'var(--text-disabled)',
              }),
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-code-sm)',
                    letterSpacing: 'var(--ls-mono)',
                  },
                },
                t.label,
              ),
              t.dirty
                ? /*#__PURE__*/ React.createElement('span', {
                    style: {
                      width: 5,
                      height: 5,
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--accent)',
                    },
                  })
                : null,
              onClose
                ? /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      role: 'button',
                      'aria-label': 'Close ' + t.label,
                      onClick: (e) => {
                        e.stopPropagation();
                        onClose(t.id);
                      },
                      style: {
                        display: 'grid',
                        placeItems: 'center',
                        width: 16,
                        height: 16,
                        borderRadius: 'var(--radius-xs)',
                        color: 'var(--text-tertiary)',
                        opacity: on || hot ? 1 : 0,
                        transition: 'opacity var(--dur-fast) var(--ease-out)',
                      },
                    },
                    /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                      name: 'x',
                      size: 11,
                    }),
                  )
                : null,
            );
          }),
          onAdd
            ? /*#__PURE__*/ React.createElement(
                'div',
                {
                  role: 'button',
                  'aria-label': 'New flow',
                  onClick: onAdd,
                  style: {
                    display: 'grid',
                    placeItems: 'center',
                    alignSelf: 'center',
                    width: 24,
                    height: 24,
                    marginLeft: 2,
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                  },
                },
                /*#__PURE__*/ React.createElement(__ds_scope.Icon, {
                  name: 'plus',
                  size: 14,
                }),
              )
            : null,
        );
      }
      Object.assign(__ds_scope, { TabStrip });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/surface/TabStrip.jsx',
      error: String((e && e.message) || e),
    });
  }

  // components/surface/Toolbar.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      function Toolbar({
        children,
        align = 'left',
        height,
        glass = false,
        divider = 'none',
        padding = '0 var(--space-5)',
        style,
        ...rest
      }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  align === 'right'
                    ? 'flex-end'
                    : align === 'center'
                      ? 'center'
                      : align === 'between'
                        ? 'space-between'
                        : 'flex-start',
                gap: 'var(--space-4)',
                height: height || 'var(--toolbar-h)',
                padding,
                flex: 'none',
                background: glass ? 'var(--glass-1)' : 'transparent',
                backdropFilter: glass
                  ? 'blur(var(--blur-1)) saturate(var(--saturate-glass))'
                  : undefined,
                WebkitBackdropFilter: glass
                  ? 'blur(var(--blur-1)) saturate(var(--saturate-glass))'
                  : undefined,
                borderTop:
                  divider === 'top' || divider === 'both'
                    ? 'var(--border-hair) solid var(--edge-1)'
                    : undefined,
                borderBottom:
                  divider === 'bottom' || divider === 'both'
                    ? 'var(--border-hair) solid var(--edge-1)'
                    : undefined,
                ...style,
              },
            },
            rest,
          ),
          children,
        );
      }
      Object.assign(__ds_scope, { Toolbar });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/surface/Toolbar.jsx',
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/conductor-c-aurora/AppUnderTest.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t) Object.hasOwn(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      /* Recreation of the screen under test — the team's order-preparation app.
   Every element Conductor can target carries data-a11y-* attributes, so the inspector measures
   real rendered geometry instead of hand-written coordinates. */
      const { Icon } = window.ConductorDesignSystem_527814;
      const a11y = (id, kind, text, selector) => ({
        'data-a11y-id': id,
        'data-a11y-kind': kind,
        'data-a11y-text': text,
        'data-a11y-selector': selector,
      });
      function OrderCard({ index, due, code, person, mode, items }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {},
            a11y('card' + index, 'View', 'Pedido ' + code, 'id: "order-card-' + index + '"'),
            {
              style: {
                borderRadius: 12,
                background: 'oklch(100% 0 0 / 0.045)',
                border: '1px solid oklch(100% 0 0 / 0.09)',
                overflow: 'hidden',
              },
            },
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                padding: '12px 12px 10px',
                display: 'grid',
                gap: 4,
              },
            },
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                },
              },
              /*#__PURE__*/ React.createElement(
                'span',
                _extends(
                  {},
                  a11y(
                    'due' + index,
                    'Text',
                    'Preparar até ' + due,
                    'text: "Preparar até ' + due + '"',
                  ),
                  {
                    style: {
                      font: 'var(--w-medium) 12px/1.3 var(--font-ui)',
                      color: 'oklch(78% 0.004 265)',
                    },
                  },
                ),
                'Preparar at\xE9 ',
                due,
              ),
              /*#__PURE__*/ React.createElement(
                'span',
                _extends(
                  {},
                  a11y(
                    'open' + index,
                    'Button',
                    'Abrir pedido ' + code,
                    'id: "order-open-' + index + '"',
                  ),
                  {
                    style: {
                      display: 'grid',
                      placeItems: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: '1px solid oklch(100% 0 0 / 0.14)',
                      color: 'oklch(70% 0.005 265)',
                    },
                  },
                ),
                /*#__PURE__*/ React.createElement(Icon, {
                  name: 'chevron-right',
                  size: 12,
                }),
              ),
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              _extends({}, a11y('code' + index, 'Text', code, 'text: "' + code + '"'), {
                style: {
                  font: 'var(--w-semibold) 14px/1.3 var(--font-ui)',
                  color: 'oklch(97% 0.001 265)',
                  justifySelf: 'start',
                },
              }),
              code,
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              _extends({}, a11y('person' + index, 'Text', person, 'text: "' + person + '"'), {
                style: {
                  font: 'var(--w-regular) 12px/1.3 var(--font-ui)',
                  color: 'oklch(62% 0.006 265)',
                  justifySelf: 'start',
                },
              }),
              person,
            ),
          ),
          /*#__PURE__*/ React.createElement('div', {
            style: {
              height: 1,
              background: 'oklch(100% 0 0 / 0.07)',
              margin: '0 12px',
            },
          }),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                padding: '10px 12px 12px',
                display: 'grid',
                gap: 4,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              _extends({}, a11y('mode' + index, 'Text', mode, 'text: "' + mode + '"'), {
                style: {
                  font: 'var(--w-regular) 12px/1.3 var(--font-ui)',
                  color: 'oklch(62% 0.006 265)',
                  justifySelf: 'start',
                },
              }),
              mode,
            ),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                },
              },
              /*#__PURE__*/ React.createElement(
                'span',
                _extends({}, a11y('items' + index, 'Text', items, 'text: "' + items + '"'), {
                  style: {
                    font: 'var(--w-regular) 12px/1.3 var(--font-ui)',
                    color: 'oklch(70% 0.005 265)',
                  },
                }),
                items,
              ),
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    display: 'flex',
                    gap: 10,
                    color: 'oklch(58% 0.006 265)',
                  },
                },
                /*#__PURE__*/ React.createElement(Icon, {
                  name: 'filter',
                  size: 13,
                }),
                /*#__PURE__*/ React.createElement(Icon, {
                  name: 'zap',
                  size: 13,
                }),
              ),
            ),
          ),
        );
      }
      function AppUnderTest() {
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              height: '100%',
              minHeight: '100%',
              background: 'oklch(13% 0.008 265)',
              display: 'grid',
              gridTemplateRows: 'auto 1fr',
              fontFamily: 'var(--font-ui)',
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px 8px',
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              _extends(
                {},
                a11y('title', 'Text', 'Pedidos pendentes', 'text: "Pedidos pendentes"'),
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    flex: 1,
                    font: 'var(--w-bold) 16px/1.2 var(--font-display)',
                    letterSpacing: '-0.02em',
                    color: 'oklch(97% 0.001 265)',
                  },
                },
              ),
              'Pedidos pendentes',
              /*#__PURE__*/ React.createElement(Icon, {
                name: 'chevron-down',
                size: 13,
                color: 'oklch(70% 0.005 265)',
              }),
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              _extends({}, a11y('search', 'Button', 'Buscar', 'id: "search-button"'), {
                style: {
                  display: 'grid',
                  placeItems: 'center',
                  width: 24,
                  height: 24,
                  color: 'oklch(78% 0.004 265)',
                },
              }),
              /*#__PURE__*/ React.createElement(Icon, {
                name: 'search',
                size: 17,
              }),
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              _extends({}, a11y('menu', 'Button', 'Menu', 'id: "orders-menu"'), {
                style: {
                  display: 'grid',
                  placeItems: 'center',
                  width: 24,
                  height: 24,
                  color: 'oklch(78% 0.004 265)',
                },
              }),
              /*#__PURE__*/ React.createElement(Icon, {
                name: 'ellipsis-vertical',
                size: 17,
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                alignContent: 'start',
                gap: 12,
                padding: '6px 12px',
              },
            },
            /*#__PURE__*/ React.createElement(OrderCard, {
              index: 0,
              due: '3:30 PM',
              code: 'SLR 701-001',
              person: 'John Doe',
              mode: 'Entrega \xB7 FedEx',
              items: '4 produtos \xB7 9 unidades',
            }),
            /*#__PURE__*/ React.createElement(OrderCard, {
              index: 1,
              due: '4:15 PM',
              code: 'SLR 701-002',
              person: 'John Doe',
              mode: 'Retirada',
              items: '2 produtos \xB7 3 unidades',
            }),
          ),
        );
      }
      Object.assign(window, {
        AppUnderTest,
      });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/conductor-c-aurora/AppUnderTest.jsx',
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/conductor-c-aurora/CDoctor.jsx
  try {
    (() => {
      /* AURORA — Doctor. One dataset, two surfaces.

   1. CDoctorInstaller — the blocking first-run window. Maestro is the only dependency Conductor
      can install by itself, so it is the only thing this window talks about. Small, centred,
      no full traffic lights: it is an installer, not a document window.
   2. CDoctorSheet — the continuous diagnostic. A macOS sheet: it drops out from under the
      toolbar, square along its top edge because it is attached to the window. Everything the
      user must install or sign into themselves is reported here and nowhere else.

   The sheet reports state and does not act. Logins and installs happen in the terminal, by the
   person — Conductor never pretends it can do them. */
      const DocNS = window.ConductorDesignSystem_527814;
      const {
        Icon: DocIcon,
        Button: DocButton,
        IconButton: DocIconButton,
        Tooltip: DocTooltip,
      } = DocNS;
      const DOCTOR_STATES = {
        ok: {
          icon: 'circle-check',
          color: 'var(--state-pass)',
        },
        warn: {
          icon: 'circle-alert',
          color: 'var(--state-running)',
        },
        fail: {
          icon: 'circle-x',
          color: 'var(--state-fail)',
        },
      };

      /* Detail lines are machine register — the exact string the CLI printed — so a developer who is
   asked for help reads the same text they would have typed. */
      const DOCTOR_GROUPS = [
        {
          label: 'Managed by Conductor',
          note: 'Installed on first launch and kept current. Nothing here needs you.',
          rows: [
            {
              name: 'Maestro',
              detail: '1.39.9 · ~/.maestro/bin/maestro',
              short: '1.39.9',
              status: 'ok',
              label: 'Installed',
            },
          ],
        },
        {
          label: 'Android',
          rows: [
            {
              name: 'Android platform-tools',
              detail: 'adb 35.0.2 · /opt/homebrew/bin/adb',
              short: 'adb 35.0.2',
              status: 'ok',
              label: 'Ready',
            },
            {
              name: 'Java Development Kit',
              detail: 'java -version → command not found',
              short: 'not on PATH',
              status: 'fail',
              label: 'Not found',
            },
          ],
        },
        {
          label: 'Command line',
          rows: [
            {
              name: 'Xcode command line tools',
              detail: '16.2 · /Library/Developer/CommandLineTools',
              short: '16.2',
              status: 'ok',
              label: 'Installed',
            },
            {
              name: 'GitHub CLI',
              detail: 'gh 2.62.0 · /opt/homebrew/bin/gh',
              short: 'gh 2.62.0',
              status: 'ok',
              label: 'Installed',
            },
          ],
        },
        {
          label: 'Accounts',
          note: 'Signing in is always yours to do. Conductor reads the state, it never logs in for you.',
          rows: [
            {
              name: 'GitHub',
              detail: 'gh auth status → not logged in',
              short: 'not logged in',
              status: 'warn',
              label: 'Signed out',
            },
          ],
        },
      ];
      const DOCTOR_ISSUES = DOCTOR_GROUPS.reduce(
        (n, g) => n + g.rows.filter((r) => r.status !== 'ok').length,
        0,
      );

      /* The sheet slides out from behind the toolbar; there is no keyframe for that in the system yet. */
      if (!document.getElementById('cd-doctor-motion')) {
        const st = document.createElement('style');
        st.id = 'cd-doctor-motion';
        st.textContent =
          '@keyframes cd-sheet-in{from{transform:translateY(-101%)}to{transform:translateY(0)}}' +
          '@media (prefers-reduced-motion: reduce){[data-cd-sheet]{animation:none!important}}';
        document.head.appendChild(st);
      }
      const DOCTOR_LABEL = {
        font: 'var(--type-label)',
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
      };
      function CDoctorRow({ row, last }) {
        const s = DOCTOR_STATES[row.status];
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: '15px minmax(0,1fr) auto',
              alignItems: 'center',
              columnGap: 10,
              padding: '9px 11px',
              borderBottom: last ? 'none' : '1px solid var(--a-hair)',
            },
          },
          /*#__PURE__*/ React.createElement(DocIcon, {
            name: s.icon,
            size: 15,
            color: s.color,
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'grid',
                gap: 2,
                minWidth: 0,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-body-strong)',
                  color: 'var(--text-primary)',
                },
              },
              row.name,
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-mono-label)',
                  color: row.status === 'ok' ? 'var(--text-disabled)' : 'var(--text-tertiary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              row.detail,
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-caption)',
                color: row.status === 'ok' ? 'var(--text-tertiary)' : s.color,
              },
            },
            row.label,
          ),
        );
      }
      function CDoctorSheet({ open, onClose }) {
        if (!open) return null;
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              position: 'absolute',
              inset: 0,
              zIndex: 60,
              background: 'oklch(16% 0.020 265 / 0.46)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              animation: 'cd-fade-in var(--dur-base) var(--ease-out)',
            },
            onClick: onClose,
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 520,
                maxWidth: 'calc(100% - 32px)',
                overflow: 'hidden',
                borderRadius: '0 0 var(--a-radius-region) var(--a-radius-region)',
              },
            },
            /*#__PURE__*/ React.createElement(
              'div',
              {
                'data-cd-sheet': true,
                onClick: (e) => e.stopPropagation(),
                role: 'dialog',
                'aria-modal': 'true',
                style: {
                  display: 'grid',
                  gridTemplateRows: 'auto minmax(0,1fr) auto',
                  maxHeight: 'min(680px, calc(100vh - 140px))',
                  /* The sheet is the frontmost layer in the window, so it has to sit a clear step
         above the panes behind it: --a-content alone lands within a few points of the
         window fill in dark. A white lift over it separates the two in both themes. */
                  background:
                    'linear-gradient(0deg, oklch(100% 0 0 / 0.13), oklch(100% 0 0 / 0.13)), var(--a-content)',
                  backdropFilter: 'blur(30px) saturate(var(--a-saturate))',
                  WebkitBackdropFilter: 'blur(30px) saturate(var(--a-saturate))',
                  borderRadius: '0 0 var(--a-radius-region) var(--a-radius-region)',
                  boxShadow: 'var(--a-refract), 0 0 0 1px var(--a-hair-strong), var(--shadow-3)',
                  animation: 'cd-sheet-in var(--dur-slow) var(--ease-glass)',
                },
              },
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 11,
                    padding: '16px 16px 12px',
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      display: 'grid',
                      placeItems: 'center',
                      width: 30,
                      height: 30,
                      flex: 'none',
                      borderRadius: 'var(--a-radius-field)',
                      background: 'var(--accent-quiet)',
                      color: 'var(--accent)',
                    },
                  },
                  /*#__PURE__*/ React.createElement(DocIcon, {
                    name: 'activity',
                    size: 16,
                  }),
                ),
                /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      display: 'grid',
                      gap: 2,
                      flex: 1,
                      minWidth: 0,
                    },
                  },
                  /*#__PURE__*/ React.createElement(
                    'h2',
                    {
                      style: {
                        font: 'var(--type-title-3)',
                        color: 'var(--text-primary)',
                      },
                    },
                    'Doctor',
                  ),
                  /*#__PURE__*/ React.createElement(
                    'p',
                    {
                      style: {
                        font: 'var(--type-body)',
                        color: 'var(--text-secondary)',
                      },
                    },
                    'What Conductor needs on this Mac. Checked at every launch.',
                  ),
                ),
                /*#__PURE__*/ React.createElement(DocIconButton, {
                  icon: 'x',
                  label: 'Close',
                  size: 'sm',
                  onClick: onClose,
                }),
              ),
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  className: 'a-scroll',
                  style: {
                    overflowY: 'auto',
                    display: 'grid',
                    gap: 14,
                    padding: '2px 16px 16px',
                  },
                },
                DOCTOR_GROUPS.map((g) =>
                  /*#__PURE__*/ React.createElement(
                    'section',
                    {
                      key: g.label,
                      style: {
                        display: 'grid',
                        gap: 6,
                      },
                    },
                    /*#__PURE__*/ React.createElement(
                      'h3',
                      {
                        style: {
                          ...DOCTOR_LABEL,
                          padding: '0 2px',
                        },
                      },
                      g.label,
                    ),
                    /*#__PURE__*/ React.createElement(
                      'div',
                      {
                        style: {
                          background: 'var(--a-well)',
                          border: '1px solid var(--a-hair)',
                          borderRadius: 'var(--a-radius-surface)',
                          overflow: 'hidden',
                        },
                      },
                      g.rows.map((r, i) =>
                        /*#__PURE__*/ React.createElement(CDoctorRow, {
                          key: r.name,
                          row: r,
                          last: i === g.rows.length - 1,
                        }),
                      ),
                    ),
                    g.note
                      ? /*#__PURE__*/ React.createElement(
                          'p',
                          {
                            style: {
                              font: 'var(--type-caption)',
                              color: 'var(--text-tertiary)',
                              padding: '0 2px',
                              textWrap: 'pretty',
                            },
                          },
                          g.note,
                        )
                      : null,
                  ),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderTop: '1px solid var(--a-hair)',
                    background: 'var(--a-well)',
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-mono-label)',
                      color: 'var(--text-tertiary)',
                      flex: 1,
                    },
                  },
                  'Checked Aug 4, 9:12 am',
                ),
                /*#__PURE__*/ React.createElement(
                  DocButton,
                  {
                    variant: 'ghost',
                    icon: 'refresh-cw',
                  },
                  'Check again',
                ),
                /*#__PURE__*/ React.createElement(
                  DocButton,
                  {
                    variant: 'primary',
                    onClick: onClose,
                  },
                  'Done',
                ),
              ),
            ),
          ),
        );
      }

      /* Toolbar affordance. Nothing blocks the app, so the count lives in the chrome until it is zero,
   at which point Doctor is a plain, quiet button like any other window action. */
      function CDoctorBadge({ count, onClick, selected }) {
        if (!count)
          return /*#__PURE__*/ React.createElement(
            DocTooltip,
            {
              content: 'Doctor',
            },
            /*#__PURE__*/ React.createElement(DocIconButton, {
              icon: 'activity',
              label: 'Doctor',
              selected: selected,
              onClick: onClick,
            }),
          );
        return /*#__PURE__*/ React.createElement(
          DocTooltip,
          {
            content:
              count === 1 ? 'Doctor · 1 item needs you' : 'Doctor · ' + count + ' items need you',
          },
          /*#__PURE__*/ React.createElement(
            'button',
            {
              type: 'button',
              onClick: onClick,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                height: 28,
                padding: '0 9px',
                borderRadius: 'var(--a-radius-field)',
                cursor: 'pointer',
                font: 'var(--type-caption)',
                background: 'var(--state-running-quiet)',
                border: '1px solid var(--state-running-edge)',
                color: 'var(--state-running)',
              },
            },
            /*#__PURE__*/ React.createElement(DocIcon, {
              name: 'triangle-alert',
              size: 13,
              color: 'var(--state-running)',
            }),
            count,
          ),
        );
      }

      /* ── First run ─────────────────────────────────────────────────────────────────────────────── */

      const INSTALL_STEPS = [
        {
          at: 0,
          label: 'Downloading maestro 1.39.9',
        },
        {
          at: 46,
          label: 'Extracting to ~/.maestro',
        },
        {
          at: 72,
          label: 'Adding maestro to PATH',
        },
        {
          at: 90,
          label: 'Verifying installation',
        },
      ];
      function useInstallProgress() {
        const [pct, setPct] = React.useState(4);
        React.useEffect(() => {
          const id = setInterval(() => setPct((p) => (p >= 118 ? 4 : p + 1)), 90);
          return () => clearInterval(id);
        }, []);
        const done = pct >= 100;
        const step = [...INSTALL_STEPS].reverse().find((s) => pct >= s.at) || INSTALL_STEPS[0];
        return {
          pct: Math.min(pct, 100),
          done,
          step: step.label,
        };
      }
      function CDoctorInstaller() {
        const { pct, done, step } = useInstallProgress();
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            className: 'a-rim',
            style: {
              position: 'relative',
              zIndex: 1,
              width: 520,
              height: 360,
              boxSizing: 'border-box',
              display: 'grid',
              gridTemplateRows: 'auto minmax(0,1fr)',
              borderRadius: 'var(--a-radius-window)',
              background: 'var(--a-panel)',
              backdropFilter: 'blur(var(--a-blur)) saturate(var(--a-saturate))',
              WebkitBackdropFilter: 'blur(var(--a-blur)) saturate(var(--a-saturate))',
              boxShadow: 'var(--shadow-window)',
              overflow: 'hidden',
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 38,
                padding: '0 14px',
                background: 'var(--a-chrome)',
                borderBottom: '1px solid var(--a-hair)',
              },
            },
            /*#__PURE__*/ React.createElement('span', {
              style: {
                width: 12,
                height: 12,
                borderRadius: 999,
                background: 'oklch(65% 0.200 24)',
                boxShadow: 'inset 0 0 0 0.5px oklch(52% 0.180 24)',
              },
            }),
            /*#__PURE__*/ React.createElement('span', {
              style: {
                width: 12,
                height: 12,
                borderRadius: 999,
                background: 'var(--a-hair-strong)',
              },
            }),
            /*#__PURE__*/ React.createElement('span', {
              style: {
                width: 12,
                height: 12,
                borderRadius: 999,
                background: 'var(--a-hair-strong)',
              },
            }),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                alignContent: 'center',
                justifyItems: 'center',
                gap: 0,
                padding: '0 44px',
                textAlign: 'center',
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  display: 'grid',
                  placeItems: 'center',
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  background: 'var(--grad-aurora)',
                  boxShadow: 'var(--shadow-2), var(--a-refract)',
                },
              },
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-title-1)',
                    color: 'oklch(100% 0 0)',
                    letterSpacing: '-0.05em',
                  },
                },
                'C',
              ),
            ),
            /*#__PURE__*/ React.createElement(
              'h1',
              {
                style: {
                  font: 'var(--type-title-2)',
                  color: 'var(--text-primary)',
                  marginTop: 18,
                },
              },
              'Setting up Conductor',
            ),
            /*#__PURE__*/ React.createElement(
              'p',
              {
                style: {
                  font: 'var(--type-body)',
                  color: 'var(--text-secondary)',
                  marginTop: 6,
                  textWrap: 'pretty',
                },
              },
              'Installing Maestro, the runner behind every test. This happens once.',
            ),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  width: '100%',
                  height: 4,
                  marginTop: 26,
                  borderRadius: 999,
                  background: 'var(--a-hair-strong)',
                  overflow: 'hidden',
                },
              },
              /*#__PURE__*/ React.createElement('div', {
                style: {
                  width: pct + '%',
                  height: '100%',
                  borderRadius: 999,
                  background: done ? 'var(--state-pass)' : 'var(--accent)',
                  transition:
                    'width var(--dur-base) linear, background var(--dur-base) var(--ease-out)',
                },
              }),
            ),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  marginTop: 10,
                },
              },
              done
                ? /*#__PURE__*/ React.createElement(DocIcon, {
                    name: 'check',
                    size: 13,
                    color: 'var(--state-pass)',
                  })
                : null,
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-mono-label)',
                    color: done ? 'var(--state-pass)' : 'var(--text-tertiary)',
                    flex: 1,
                    textAlign: 'left',
                  },
                },
                done ? 'maestro 1.39.9 is ready' : step,
              ),
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-mono-label)',
                    color: 'var(--text-disabled)',
                  },
                },
                pct,
                '%',
              ),
            ),
          ),
        );
      }
      Object.assign(window, {
        CDoctorSheet,
        CDoctorBadge,
        CDoctorInstaller,
        DOCTOR_GROUPS,
        DOCTOR_ISSUES,
      });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/conductor-c-aurora/CDoctor.jsx',
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/conductor-c-aurora/CDoctorB.jsx
  try {
    (() => {
      /* AURORA — Doctor, variation B. Same sheet, same placement, different reading order.

   A reads as a form: four equal group cards, every row two lines, ownership stated before state.
   B leads with the verdict — a status band naming what is wrong — and then one continuous table
   ordered by who has to act: NEEDS YOU first, READY under it. Healthy rows carry only a version;
   the full CLI string appears where something is broken and a person has to read it.

   Same data (window.DOCTOR_GROUPS), so the two stay in sync. */
      const DocBNS = window.ConductorDesignSystem_527814;
      const { Icon: DocBIcon, Button: DocBButton, IconButton: DocBIconButton } = DocBNS;
      const DOC_B_STATES = {
        ok: {
          icon: 'circle-check',
          color: 'var(--state-pass)',
        },
        warn: {
          icon: 'circle-alert',
          color: 'var(--state-running)',
        },
        fail: {
          icon: 'circle-x',
          color: 'var(--state-fail)',
        },
      };
      function docBRows() {
        const all = [];
        (window.DOCTOR_GROUPS || []).forEach((g) =>
          g.rows.forEach((r) =>
            all.push({
              ...r,
              group: g.label,
            }),
          ),
        );
        return {
          issues: all.filter((r) => r.status !== 'ok'),
          ready: all.filter((r) => r.status === 'ok'),
        };
      }
      function CDoctorRowB({ row, last, full }) {
        const s = DOC_B_STATES[row.status];
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: '15px minmax(0,1fr) auto',
              alignItems: 'center',
              columnGap: 10,
              padding: full ? '8px 14px' : '7px 14px',
              borderBottom: last ? 'none' : '1px solid var(--a-hair)',
            },
          },
          /*#__PURE__*/ React.createElement(DocBIcon, {
            name: s.icon,
            size: 15,
            color: s.color,
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'grid',
                gap: 1,
                minWidth: 0,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-body-strong)',
                  color: 'var(--text-primary)',
                },
              },
              row.name,
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-mono-label)',
                  color: row.status === 'ok' ? 'var(--text-disabled)' : s.color,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              full ? row.detail : row.short,
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-caption)',
                color: row.status === 'ok' ? 'var(--text-tertiary)' : s.color,
              },
            },
            row.label,
          ),
        );
      }
      function CDoctorSectionB({ label, children }) {
        return /*#__PURE__*/ React.createElement(
          React.Fragment,
          null,
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                padding: '7px 14px 6px',
                background: 'var(--a-well)',
                borderBottom: '1px solid var(--a-hair)',
                font: 'var(--type-label)',
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
              },
            },
            label,
          ),
          children,
        );
      }
      function CDoctorSheetB({ open, onClose }) {
        if (!open) return null;
        const { issues, ready } = docBRows();
        const verdict =
          issues.length === 0
            ? {
                icon: 'circle-check',
                color: 'var(--state-pass)',
                fill: 'var(--state-pass-quiet)',
                edge: 'var(--state-pass-edge)',
                title: 'Everything is ready',
                body: 'Conductor has what it needs on this Mac.',
              }
            : {
                icon: 'triangle-alert',
                color: 'var(--state-running)',
                fill: 'var(--state-running-quiet)',
                edge: 'var(--state-running-edge)',
                title:
                  issues.length === 1 ? '1 thing needs you' : issues.length + ' things need you',
                body: 'Conductor runs without them, and cannot install or sign in on your behalf.',
              };
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              position: 'absolute',
              inset: 0,
              zIndex: 60,
              background: 'oklch(16% 0.020 265 / 0.46)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              animation: 'cd-fade-in var(--dur-base) var(--ease-out)',
            },
            onClick: onClose,
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 560,
                maxWidth: 'calc(100% - 32px)',
                overflow: 'hidden',
                borderRadius: '0 0 var(--a-radius-region) var(--a-radius-region)',
              },
            },
            /*#__PURE__*/ React.createElement(
              'div',
              {
                'data-cd-sheet': true,
                onClick: (e) => e.stopPropagation(),
                role: 'dialog',
                'aria-modal': 'true',
                style: {
                  display: 'grid',
                  gridTemplateRows: 'auto auto minmax(0,1fr) auto',
                  maxHeight: 'min(680px, calc(100vh - 140px))',
                  background:
                    'linear-gradient(0deg, oklch(100% 0 0 / 0.13), oklch(100% 0 0 / 0.13)), var(--a-content)',
                  backdropFilter: 'blur(30px) saturate(var(--a-saturate))',
                  WebkitBackdropFilter: 'blur(30px) saturate(var(--a-saturate))',
                  borderRadius: '0 0 var(--a-radius-region) var(--a-radius-region)',
                  boxShadow: 'var(--a-refract), 0 0 0 1px var(--a-hair-strong), var(--shadow-3)',
                  animation: 'cd-sheet-in var(--dur-slow) var(--ease-glass)',
                },
              },
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '11px 12px 11px 16px',
                    borderBottom: '1px solid var(--a-hair)',
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-body-strong)',
                      color: 'var(--text-primary)',
                      flex: 1,
                    },
                  },
                  'Doctor',
                ),
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      font: 'var(--type-mono-label)',
                      color: 'var(--text-tertiary)',
                    },
                  },
                  'checked 9:12 am',
                ),
                /*#__PURE__*/ React.createElement(DocBIconButton, {
                  icon: 'x',
                  label: 'Close',
                  size: 'sm',
                  onClick: onClose,
                }),
              ),
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 11,
                    padding: '14px 16px',
                    background: verdict.fill,
                    borderBottom: '1px solid ' + verdict.edge,
                  },
                },
                /*#__PURE__*/ React.createElement(DocBIcon, {
                  name: verdict.icon,
                  size: 19,
                  color: verdict.color,
                  style: {
                    marginTop: 1,
                  },
                }),
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      display: 'grid',
                      gap: 3,
                      minWidth: 0,
                    },
                  },
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        font: 'var(--type-title-3)',
                        color: 'var(--text-primary)',
                      },
                    },
                    verdict.title,
                  ),
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        font: 'var(--type-body)',
                        color: 'var(--text-secondary)',
                        textWrap: 'pretty',
                      },
                    },
                    verdict.body,
                  ),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  className: 'a-scroll',
                  style: {
                    overflowY: 'auto',
                    padding: 16,
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      background: 'var(--a-well)',
                      border: '1px solid var(--a-hair)',
                      borderRadius: 'var(--a-radius-surface)',
                      overflow: 'hidden',
                    },
                  },
                  issues.length
                    ? /*#__PURE__*/ React.createElement(
                        CDoctorSectionB,
                        {
                          label: 'Needs you',
                        },
                        issues.map((r, i) =>
                          /*#__PURE__*/ React.createElement(CDoctorRowB, {
                            key: r.name,
                            row: r,
                            full: true,
                            last: i === issues.length - 1,
                          }),
                        ),
                      )
                    : null,
                  /*#__PURE__*/ React.createElement(
                    CDoctorSectionB,
                    {
                      label: 'Ready',
                    },
                    ready.map((r, i) =>
                      /*#__PURE__*/ React.createElement(CDoctorRowB, {
                        key: r.name,
                        row: r,
                        last: i === ready.length - 1,
                      }),
                    ),
                  ),
                ),
                /*#__PURE__*/ React.createElement(
                  'p',
                  {
                    style: {
                      font: 'var(--type-caption)',
                      color: 'var(--text-tertiary)',
                      padding: '10px 2px 0',
                      textWrap: 'pretty',
                    },
                  },
                  'Maestro is the only one Conductor installs and updates by itself. The rest live on your machine, and signing in is always yours to do.',
                ),
              ),
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 8,
                    padding: '10px 16px',
                    borderTop: '1px solid var(--a-hair)',
                    background: 'var(--a-well)',
                  },
                },
                /*#__PURE__*/ React.createElement(
                  DocBButton,
                  {
                    variant: 'ghost',
                    icon: 'refresh-cw',
                  },
                  'Check again',
                ),
                /*#__PURE__*/ React.createElement(
                  DocBButton,
                  {
                    variant: 'primary',
                    onClick: onClose,
                  },
                  'Done',
                ),
              ),
            ),
          ),
        );
      }
      Object.assign(window, {
        CDoctorSheetB,
      });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/conductor-c-aurora/CDoctorB.jsx',
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/conductor-c-aurora/CRegions.jsx
  try {
    (() => {
      /* AURORA — regions, laid out like a macOS app window.
   sidebar (flows) │ working area (editor + assistant) │ inspector (device)

   The difference from the previous pass: regions are not floating cards on a colourful wash.
   They are ADJACENT AREAS of one window, separated by 1px hairlines, and they differ only in
   how much of the window's blur they let through:

     sidebar / inspector  --a-panel    translucent, the wallpaper reads through (vibrancy)
     working area         --a-content  near-opaque, so code and chat text sit still
     fields / wells       --a-well     recessed controls inside either

   No gaps, no per-panel shadows, no gradient rims, no nested blurs. Controls are small and
   system-sized (26–28px), radii are 6–10, and the only saturated colour is the accent on the
   primary action and the sidebar selection. */
      const NS = window.ConductorDesignSystem_527814;
      const {
        DeviceMirror,
        YamlEditor,
        Icon,
        IconButton,
        Tooltip,
        ChatMessage,
        ChatComposer,
        StatusDot,
      } = NS;
      const A_HAIR = '1px solid var(--a-hair)';
      const PANEL = {
        background: 'var(--a-panel)',
        minHeight: 0,
      };
      const PILL = {
        background: 'var(--a-well)',
        border: A_HAIR,
        borderRadius: 'var(--a-radius-field)',
      };
      const DOT = {
        pass: 'var(--state-pass)',
        fail: 'var(--state-fail)',
        never: 'var(--state-idle)',
        running: 'var(--state-running)',
      };
      const CAPS = {
        font: 'var(--type-label)',
        letterSpacing: 'var(--ls-caps)',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
      };
      /* Region headers: same height everywhere, hairline underneath, nothing else. */
      const HEADER = {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 38,
        padding: '0 8px 0 12px',
        borderBottom: A_HAIR,
        flex: 'none',
        minWidth: 0,
        overflow: 'hidden',
      };

      /* ── Sidebar: flows ────────────────────────────────────────────────────────────────────── */
      function CFlowRow({ test, selected, onOpen, onMenu }) {
        const [hover, setHover] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            onClick: () => onOpen(test.id),
            onContextMenu: (e) => {
              e.preventDefault();
              onMenu(test.id, e);
            },
            style: {
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
              alignItems: 'center',
              gap: 9,
              padding: '6px 6px 6px 9px',
              borderRadius: 'var(--a-radius-surface)',
              cursor: 'pointer',
              background: selected ? 'var(--accent)' : hover ? 'var(--glass-hover)' : 'transparent',
              transition: 'background var(--dur-fast) var(--ease-out)',
            },
          },
          /*#__PURE__*/ React.createElement('span', {
            style: {
              width: 6,
              height: 6,
              borderRadius: 999,
              background: selected ? 'var(--accent-on)' : DOT[test.lastResult],
              flex: 'none',
              opacity: selected ? 0.8 : 1,
            },
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'grid',
                gap: 1,
                minWidth: 0,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-code-sm)',
                  color: selected ? 'var(--accent-on)' : 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              test.name,
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-mono-label)',
                  color: selected ? 'var(--accent-on)' : 'var(--text-disabled)',
                  opacity: selected ? 0.72 : 1,
                },
              },
              test.steps,
              ' steps \xB7 ',
              test.duration || 'never run',
            ),
          ),
          hover || selected
            ? /*#__PURE__*/ React.createElement(IconButton, {
                icon: 'ellipsis',
                label: 'Flow actions',
                size: 'sm',
                onClick: (e) => {
                  e.stopPropagation();
                  onMenu(test.id, e);
                },
              })
            : test.aiAuthored
              ? /*#__PURE__*/ React.createElement(Icon, {
                  name: 'sparkles',
                  size: 12,
                  color: 'var(--ai)',
                })
              : null,
        );
      }
      function CFlows({ s }) {
        const [query, setQuery] = React.useState('');
        const [focus, setFocus] = React.useState(false);
        const shown = s.tests.filter(
          (t) => !query || t.name.toLowerCase().includes(query.toLowerCase()),
        );
        const failing = s.tests.filter((t) => t.lastResult === 'fail').length;
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              ...PANEL,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: HEADER,
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: CAPS,
              },
              'Flows',
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-mono-label)',
                  color: 'var(--text-disabled)',
                },
              },
              s.tests.length,
              ' \xB7 ',
              failing,
              ' failing',
            ),
            /*#__PURE__*/ React.createElement('span', {
              style: {
                flex: 1,
              },
            }),
            /*#__PURE__*/ React.createElement(
              Tooltip,
              {
                content: 'New flow',
              },
              /*#__PURE__*/ React.createElement(IconButton, {
                icon: 'plus',
                label: 'New flow',
                size: 'sm',
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                padding: '10px 10px 6px',
              },
            },
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  ...PILL,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 26,
                  padding: '0 8px',
                  boxShadow: focus ? 'var(--glow-accent)' : 'none',
                  borderColor: focus ? 'var(--accent-edge)' : 'var(--a-hair)',
                  transition: 'box-shadow var(--dur-fast) var(--ease-out)',
                },
              },
              /*#__PURE__*/ React.createElement(Icon, {
                name: 'search',
                size: 13,
                color: focus ? 'var(--accent)' : 'var(--text-tertiary)',
              }),
              /*#__PURE__*/ React.createElement('input', {
                value: query,
                onChange: (e) => setQuery(e.target.value),
                onFocus: () => setFocus(true),
                onBlur: () => setFocus(false),
                placeholder: 'Search',
                style: {
                  flex: 1,
                  minWidth: 0,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  font: 'var(--type-caption)',
                  color: 'var(--text-primary)',
                },
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              className: 'a-scroll',
              style: {
                overflow: 'auto',
                minHeight: 0,
                display: 'grid',
                gap: 1,
                alignContent: 'start',
                padding: '0 8px 8px',
              },
            },
            shown.map((t) =>
              /*#__PURE__*/ React.createElement(CFlowRow, {
                key: t.id,
                test: t,
                selected: t.id === s.activeTab,
                onOpen: s.openTest,
                onMenu: (id, e) =>
                  s.setRowMenu({
                    id,
                    x: e.clientX,
                    y: e.clientY,
                  }),
              }),
            ),
            !shown.length
              ? /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      padding: '20px 12px',
                      font: 'var(--type-caption)',
                      color: 'var(--text-disabled)',
                      textAlign: 'center',
                    },
                  },
                  'Nothing matches \u201C',
                  query,
                  '\u201D.',
                )
              : null,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                height: 34,
                padding: '0 8px',
                borderTop: A_HAIR,
                flex: 'none',
              },
            },
            /*#__PURE__*/ React.createElement(
              'button',
              {
                type: 'button',
                onClick: s.run,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flex: 1,
                  height: 24,
                  padding: '0 6px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 'var(--a-radius-field)',
                  cursor: 'pointer',
                  font: 'var(--type-caption)',
                  color: 'var(--text-secondary)',
                },
              },
              /*#__PURE__*/ React.createElement(Icon, {
                name: 'play',
                size: 12,
                color: 'var(--text-tertiary)',
              }),
              'Run whole suite',
            ),
            /*#__PURE__*/ React.createElement(
              Tooltip,
              {
                content: 'Settings',
              },
              /*#__PURE__*/ React.createElement(IconButton, {
                icon: 'settings',
                label: 'Settings',
                size: 'sm',
              }),
            ),
          ),
        );
      }

      /* ── Working area ──────────────────────────────────────────────────────────────────────── */
      /* Document tabs, macOS style: a strip of the window, active tab filled and lifted by a
   hairline rather than by a shadow. */
      function CTab({ tab, active, onSelect, onClose }) {
        const [hover, setHover] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            onClick: () => onSelect(tab.id),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 26,
              padding: '0 6px 0 10px',
              borderRadius: 'var(--a-radius-field)',
              cursor: 'pointer',
              background: active ? 'var(--a-well)' : hover ? 'var(--glass-hover)' : 'transparent',
              border: '1px solid ' + (active ? 'var(--a-hair)' : 'transparent'),
            },
          },
          /*#__PURE__*/ React.createElement(Icon, {
            name: 'file-code',
            size: 12,
            color: active ? 'var(--accent)' : 'var(--text-tertiary)',
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-code-sm)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              },
            },
            tab.label,
          ),
          tab.dirty
            ? /*#__PURE__*/ React.createElement('span', {
                style: {
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: 'var(--accent)',
                },
              })
            : null,
          active || hover
            ? /*#__PURE__*/ React.createElement(IconButton, {
                icon: 'x',
                label: 'Close tab',
                size: 'sm',
                onClick: (e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                },
              })
            : null,
        );
      }
      function CTabStrip({ s }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              ...HEADER,
              padding: '0 8px',
              gap: 4,
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                minWidth: 0,
                overflow: 'hidden',
                flex: '0 1 auto',
              },
            },
            s.tabs.map((t) =>
              /*#__PURE__*/ React.createElement(CTab, {
                key: t.id,
                tab: t,
                active: t.id === s.activeTab,
                onSelect: s.setActiveTab,
                onClose: s.closeTab,
              }),
            ),
            /*#__PURE__*/ React.createElement(IconButton, {
              icon: 'plus',
              label: 'New tab',
              size: 'sm',
              onClick: s.newTab,
            }),
          ),
          /*#__PURE__*/ React.createElement('span', {
            style: {
              flex: 1,
            },
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-mono-label)',
                color: 'var(--text-disabled)',
              },
            },
            'YAML',
          ),
        );
      }

      /* Run / Assistant as a segmented control — the macOS way to switch a pane's content. */
      function CSubTabs({ value, onChange, running }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              padding: '0 10px',
              borderTop: A_HAIR,
              borderBottom: A_HAIR,
              flex: 'none',
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                padding: 2,
                background: 'var(--a-well)',
                border: A_HAIR,
                borderRadius: 'var(--a-radius-surface)',
              },
            },
            [
              {
                id: 'run',
                label: 'Run',
              },
              {
                id: 'assistant',
                label: 'Assistant',
              },
            ].map((t) =>
              /*#__PURE__*/ React.createElement(
                'button',
                {
                  key: t.id,
                  type: 'button',
                  onClick: () => onChange(t.id),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 22,
                    padding: '0 12px',
                    cursor: 'pointer',
                    borderRadius: 5,
                    border: '1px solid ' + (value === t.id ? 'var(--a-hair)' : 'transparent'),
                    background: value === t.id ? 'var(--glass-3)' : 'transparent',
                    boxShadow: value === t.id ? 'var(--shadow-1)' : 'none',
                    font: value === t.id ? 'var(--type-body-strong)' : 'var(--type-body)',
                    color: value === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  },
                },
                t.label,
                t.id === 'run' && running
                  ? /*#__PURE__*/ React.createElement('span', {
                      style: {
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: 'var(--state-running)',
                      },
                    })
                  : null,
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement('span', {
            style: {
              flex: 1,
            },
          }),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                font: 'var(--type-mono-label)',
                color: 'var(--text-disabled)',
              },
            },
            value === 'run' ? 'adb · logcat attached' : 'Conductor 1.4',
          ),
        );
      }
      const STEP_TINT = {
        pass: 'var(--state-pass)',
        fail: 'var(--state-fail)',
        running: 'var(--state-running)',
      };
      function CRunPanel({ s }) {
        if (!s.steps.length) {
          return /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                placeItems: 'center',
                padding: 32,
                gap: 8,
                alignContent: 'center',
              },
            },
            /*#__PURE__*/ React.createElement(Icon, {
              name: 'play',
              size: 18,
              color: 'var(--text-disabled)',
            }),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-caption)',
                  color: 'var(--text-tertiary)',
                  textAlign: 'center',
                },
              },
              'Run the flow and every step reports here as it executes.',
            ),
          );
        }
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              alignContent: 'start',
              padding: '8px 16px 16px',
            },
          },
          s.steps.map((step, i) =>
            /*#__PURE__*/ React.createElement(
              'div',
              {
                key: step.id || i,
                style: {
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: '16px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 11,
                  minHeight: 32,
                },
              },
              /*#__PURE__*/ React.createElement('span', {
                style: {
                  position: 'absolute',
                  left: 7,
                  top: i ? 0 : '50%',
                  bottom: i === s.steps.length - 1 ? '50%' : 0,
                  width: 1,
                  background: 'var(--a-hair-strong)',
                },
              }),
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    position: 'relative',
                    display: 'grid',
                    placeItems: 'center',
                    width: 16,
                    height: 16,
                  },
                },
                /*#__PURE__*/ React.createElement('span', {
                  style: {
                    width: step.status === 'running' ? 8 : 6,
                    height: step.status === 'running' ? 8 : 6,
                    borderRadius: 999,
                    background: STEP_TINT[step.status] || 'var(--text-disabled)',
                    boxShadow:
                      step.status === 'running'
                        ? '0 0 0 4px var(--state-running-quiet)'
                        : '0 0 0 3px var(--a-content)',
                  },
                }),
              ),
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-code-sm)',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                },
                step.label,
              ),
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    font: 'var(--type-mono-label)',
                    color: 'var(--text-disabled)',
                  },
                },
                step.duration || '',
              ),
            ),
          ),
        );
      }
      function CAssistantPanel({ s }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              alignContent: 'start',
              gap: 16,
              padding: '16px 16px 8px',
            },
          },
          s.thread.map((m, i) =>
            /*#__PURE__*/ React.createElement(
              ChatMessage,
              {
                key: i,
                role: m.role,
                code: m.code,
                onInsert: m.code ? () => s.insert(m.code) : undefined,
                onCopy: m.code ? () => {} : undefined,
              },
              m.body,
            ),
          ),
          s.busy
            ? /*#__PURE__*/ React.createElement(ChatMessage, {
                pending: true,
              })
            : null,
          s.thread.length === 1
            ? /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  },
                },
                [
                  'Open the first pending order',
                  'Assert both order cards are visible',
                  'Screenshot after checkout',
                ].map((p) =>
                  /*#__PURE__*/ React.createElement(
                    'button',
                    {
                      key: p,
                      type: 'button',
                      onClick: () => s.ask(p),
                      style: {
                        ...PILL,
                        height: 26,
                        padding: '0 12px',
                        cursor: 'pointer',
                        font: 'var(--type-caption)',
                        color: 'var(--text-secondary)',
                      },
                    },
                    p,
                  ),
                ),
              )
            : null,
        );
      }
      function CEditorColumn({ s }) {
        const scroller = React.useRef(null);
        React.useEffect(() => {
          const id = requestAnimationFrame(() => {
            if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
          });
          return () => cancelAnimationFrame(id);
        }, [s.thread.length, s.busy, s.steps.length, s.lower]);
        const activeLine = s.yaml.replace(/\n$/, '').split('\n').length;
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              background: 'var(--a-content)',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gridTemplateRows: 'auto minmax(120px, 0.95fr) auto minmax(0, 1.05fr) auto',
              minHeight: 0,
              minWidth: 0,
            },
          },
          /*#__PURE__*/ React.createElement(CTabStrip, {
            s: s,
          }),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              className: 'a-scroll',
              style: {
                display: 'grid',
                overflow: 'auto',
                minHeight: 0,
              },
            },
            /*#__PURE__*/ React.createElement(YamlEditor, {
              value: s.yaml,
              activeLine: activeLine,
              aiLines: s.aiLines,
            }),
          ),
          /*#__PURE__*/ React.createElement(CSubTabs, {
            value: s.lower,
            onChange: s.setLower,
            running: s.running,
          }),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              ref: scroller,
              className: 'a-scroll',
              style: {
                overflow: 'auto',
                minHeight: 0,
              },
            },
            s.lower === 'run'
              ? /*#__PURE__*/ React.createElement(CRunPanel, {
                  s: s,
                })
              : /*#__PURE__*/ React.createElement(CAssistantPanel, {
                  s: s,
                }),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                borderTop: A_HAIR,
                padding: 10,
                flex: 'none',
              },
            },
            /*#__PURE__*/ React.createElement(ChatComposer, {
              style: {
                background: 'var(--a-well)',
                border: A_HAIR,
                borderRadius: 'var(--a-radius-region)',
              },
              value: s.draft,
              onChange: (e) => s.setDraft(e.target.value),
              onSubmit: (v) => {
                s.setLower('assistant');
                s.ask(v);
              },
              busy: s.busy,
              placeholder: 'Ask Conductor to write a step\u2026',
              context: s.inspector.node
                ? s.inspector.node.kind + ' · ' + s.inspector.node.text
                : undefined,
            }),
          ),
        );
      }

      /* ── Inspector: device ─────────────────────────────────────────────────────────────────── */
      /* The right pane is an inspector, so it takes the same vibrancy as the sidebar. The phone is
   the one physical object in the window and keeps its own drop shadow.
   INVARIANT: the header degrades in priority order as the pane narrows — serial truncates,
   then the caps label goes, then reload/screenshot go. Inspect always survives: it is the
   mode the whole window is in. */
      function CDevice({ s }) {
        const ins = s.inspector;
        const fit = window.useMirrorFit({
          maxWidth: s.frame.mirror,
        });
        const [headW, setHeadW] = React.useState(999);
        const headRef = React.useRef(null);
        React.useEffect(() => {
          const el = headRef.current;
          if (!el) return;
          const ro = new ResizeObserver(() => setHeadW(el.clientWidth));
          ro.observe(el);
          setHeadW(el.clientWidth);
          return () => ro.disconnect();
        }, []);
        const roomy = headW >= 250;
        const tools = headW >= 190;
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              ...PANEL,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              width: s.frame.mirror + 40,
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              ref: headRef,
              style: HEADER,
            },
            roomy
              ? /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      ...CAPS,
                      flex: 'none',
                    },
                  },
                  'Device',
                )
              : null,
            /*#__PURE__*/ React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => s.setDeviceDialog(true),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                  overflow: 'hidden',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  font: 'var(--type-mono-label)',
                  color: 'var(--text-disabled)',
                },
              },
              /*#__PURE__*/ React.createElement(StatusDot, {
                state: s.running ? 'running' : s.device.state,
                size: 7,
              }),
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                },
                s.device.serial,
              ),
            ),
            /*#__PURE__*/ React.createElement('span', {
              style: {
                flex: 1,
              },
            }),
            tools
              ? /*#__PURE__*/ React.createElement(
                  Tooltip,
                  {
                    content: 'Reload',
                    shortcut: '\u2318R',
                  },
                  /*#__PURE__*/ React.createElement(IconButton, {
                    icon: 'refresh-cw',
                    label: 'Reload mirror',
                    size: 'sm',
                  }),
                )
              : null,
            tools
              ? /*#__PURE__*/ React.createElement(
                  Tooltip,
                  {
                    content: 'Screenshot',
                  },
                  /*#__PURE__*/ React.createElement(IconButton, {
                    icon: 'camera',
                    label: 'Screenshot',
                    size: 'sm',
                  }),
                )
              : null,
            /*#__PURE__*/ React.createElement(
              Tooltip,
              {
                content: 'Inspect elements',
              },
              /*#__PURE__*/ React.createElement(IconButton, {
                icon: 'crosshair',
                label: 'Inspect',
                size: 'sm',
                selected: true,
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                minHeight: 0,
                minWidth: 0,
                padding: 14,
              },
            },
            /*#__PURE__*/ React.createElement(
              'div',
              {
                ref: fit.bayRef,
                style: {
                  display: 'grid',
                  placeItems: 'center',
                  minHeight: 0,
                  minWidth: 0,
                  overflow: 'hidden',
                },
              },
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    width: fit.outerWidth,
                    height: fit.outerHeight,
                    position: 'relative',
                    filter: 'drop-shadow(var(--device-drop))',
                  },
                },
                /*#__PURE__*/ React.createElement(
                  DeviceMirror,
                  {
                    style: fit.transform,
                    width: fit.width,
                    height: fit.height,
                    live: s.device.state === 'connected',
                    contentRef: ins.contentRef,
                    onMouseOver: ins.onMouseOver,
                    onMouseOut: ins.onMouseOut,
                    highlight: ins.node ? ins.node.rect : undefined,
                    highlightLabel: ins.node ? ins.node.kind + ' · ' + ins.node.text : undefined,
                    onContextMenu: (e) => ins.onContext(e, s.setMenu),
                  },
                  /*#__PURE__*/ React.createElement(window.AppUnderTest, null),
                ),
              ),
            ),
          ),
        );
      }
      Object.assign(window, {
        CFlows,
        CEditorColumn,
        CDevice,
        A_HAIR,
        A_PANEL: PANEL,
        A_PILL: PILL,
        A_HEADER: HEADER,
        A_CAPS: CAPS,
      });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/conductor-c-aurora/CRegions.jsx',
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/conductor-c-aurora/CShell.jsx
  try {
    (() => {
      /* AURORA — shell. One macOS window on a quiet desktop: a unified toolbar (traffic lights,
   document title, window actions) over three adjacent panes divided by hairlines. The window
   owns the single blur; nothing inside it floats.

   Run state is reported by a hairline progress line under the toolbar and by the dot on the
   Run segment. Nothing else moves. */
      const NS = window.ConductorDesignSystem_527814;
      const {
        ContextMenu,
        Dialog,
        Button,
        IconButton,
        Icon,
        StatusDot,
        Checkbox,
        Tooltip,
        ACTION_ICONS,
      } = NS;
      const { CFlows, CEditorColumn, CDevice, A_HAIR } = window;
      const C_BREAKPOINTS = [
        {
          min: 1360,
          mirror: 300,
          flows: true,
        },
        {
          min: 1120,
          mirror: 268,
          flows: true,
        },
        {
          min: 0,
          mirror: 250,
          flows: false,
        },
      ];
      function useCFrame() {
        const ref = React.useRef(null);
        const [w, setW] = React.useState(1440);
        React.useEffect(() => {
          const el = ref.current;
          if (!el) return;
          const measure = () => setW(el.clientWidth);
          measure();
          const ro = new ResizeObserver(measure);
          ro.observe(el);
          return () => ro.disconnect();
        }, []);
        const bp = C_BREAKPOINTS.find((b) => w >= b.min) || C_BREAKPOINTS[C_BREAKPOINTS.length - 1];
        return {
          ...bp,
          ref,
          width: w,
        };
      }
      function useStudioC(opts = {}) {
        const frame = useCFrame();
        const [doctor, setDoctor] = React.useState(!!opts.doctor);
        const inspector = window.useInspector();
        const [flowsPref, setFlowsPref] = React.useState('auto');
        const flows = flowsPref === 'auto' ? frame.flows : flowsPref;
        const [yaml, setYaml] = React.useState(window.FLOW_START);
        const [aiLines, setAiLines] = React.useState([]);
        const [menu, setMenu] = React.useState(null);
        const [rowMenu, setRowMenu] = React.useState(null);
        const [tests, setTests] = React.useState(window.TESTS);
        const [tabs, setTabs] = React.useState([
          {
            id: 'f-teste',
            label: 'teste.yaml',
            dirty: true,
          },
        ]);
        const [activeTab, setActiveTab] = React.useState('f-teste');
        const [lower, setLower] = React.useState('assistant');
        const [env, setEnv] = React.useState('staging');
        const [running, setRunning] = React.useState(false);
        const [steps, setSteps] = React.useState([]);
        const [draft, setDraft] = React.useState('');
        const HELLO = {
          role: 'assistant',
          body: "Right-click anything on the device and I'll write the step. Or just tell me what the test should do.",
        };
        const [thread, setThread] = React.useState([HELLO]);
        const [busy, setBusy] = React.useState(false);
        const [deviceDialog, setDeviceDialog] = React.useState(false);
        const [device, setDevice] = React.useState({
          serial: 'R9QYC01EMXL',
          state: 'connected',
        });
        const timers = React.useRef([]);
        React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
        const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
        React.useEffect(() => {
          const onKey = (e) => {
            const meta = e.metaKey || e.ctrlKey;
            if (meta && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              setFlowsPref((p) => !(p === 'auto' ? frame.flows : p));
            }
            if (meta && e.key.toLowerCase() === 'j') {
              e.preventDefault();
              setLower((l) => (l === 'assistant' ? 'run' : 'assistant'));
            }
            if (e.key === 'Escape') {
              setMenu(null);
              setRowMenu(null);
              setDoctor(false);
            }
          };
          window.addEventListener('keydown', onKey);
          return () => window.removeEventListener('keydown', onKey);
        }, [frame.flows]);
        const commandCount = () => yaml.split('\n').filter((l) => /^- /.test(l)).length;
        const flash = (next) => {
          const before = yaml.replace(/\n$/, '').split('\n').length;
          const added = [];
          for (let i = before + 1; i <= next.replace(/\n$/, '').split('\n').length; i++)
            added.push(i);
          setYaml(next);
          setAiLines(added);
          later(() => setAiLines([]), 2600);
        };
        const run = () => {
          const commands = yaml
            .split('\n')
            .filter((l) => /^- /.test(l))
            .map((l) => l.replace(/^- /, '').replace(/:$/, '').trim());
          setLower('run');
          setRunning(true);
          setSteps([]);
          commands.forEach((c, i) => {
            later(
              () => {
                setSteps((s) => [
                  ...s.map((x) =>
                    x.status === 'running'
                      ? {
                          ...x,
                          status: 'pass',
                          duration: '0:0' + (1 + (i % 2)),
                        }
                      : x,
                  ),
                  {
                    id: c + i,
                    label: window.STEP_LABELS[c] || c,
                    status: 'running',
                  },
                ]);
                if (i === commands.length - 1)
                  later(() => {
                    setSteps((s) =>
                      s.map((x) =>
                        x.status === 'running'
                          ? {
                              ...x,
                              status: 'pass',
                              duration: '0:01',
                            }
                          : x,
                      ),
                    );
                    setRunning(false);
                  }, 700);
              },
              600 * (i + 1),
            );
          });
        };
        const ask = (text) => {
          setThread((t) => [
            ...t,
            {
              role: 'user',
              body: text,
            },
          ]);
          setDraft('');
          setBusy(true);
          setLower('assistant');
          later(() => {
            const node = inspector.node || window.A11Y_FALLBACK;
            setThread((t) => [
              ...t,
              {
                role: 'assistant',
                body: 'I matched a text node in the first order card. This taps it by visible text, then waits for the detail screen.',
                code:
                  '- tapOn:\n    ' +
                  node.selector +
                  '\n- extendedWaitUntil:\n    visible:\n      text: "Detalhes do pedido"\n    timeout: 10000',
              },
            ]);
            setBusy(false);
          }, 1400);
        };
        return {
          frame,
          inspector,
          yaml,
          aiLines,
          menu,
          setMenu,
          rowMenu,
          setRowMenu,
          tests,
          setTests,
          flows,
          toggleFlows: () => setFlowsPref((p) => !(p === 'auto' ? frame.flows : p)),
          tabs,
          setTabs,
          activeTab,
          setActiveTab,
          lower,
          setLower,
          openTest: (id) => {
            const test = tests.find((t) => t.id === id);
            if (!test) return;
            setTabs((t) =>
              t.some((x) => x.id === id)
                ? t
                : [
                    ...t,
                    {
                      id,
                      label: test.name,
                    },
                  ],
            );
            setActiveTab(id);
          },
          closeTab: (id) => {
            setTabs((t) => (t.length > 1 ? t.filter((x) => x.id !== id) : t));
            if (tabs.length > 1 && id === activeTab)
              setActiveTab(tabs.filter((x) => x.id !== id)[0].id);
          },
          newTab: () => {
            const id = 'f-new' + tabs.length;
            setTabs((t) => [
              ...t,
              {
                id,
                label: 'novo-' + t.length + '.yaml',
              },
            ]);
            setActiveTab(id);
          },
          env,
          setEnv,
          running,
          steps,
          doctor,
          setDoctor,
          draft,
          setDraft,
          thread,
          busy,
          ask,
          insert: (code) => flash(yaml.replace(/\n$/, '') + '\n' + code + '\n'),
          appendStep: (command, node) =>
            flash(yaml.replace(/\n$/, '') + '\n' + window.SNIPPETS[command](node) + '\n'),
          run,
          commandCount,
          deviceDialog,
          setDeviceDialog,
          device,
          setDevice,
        };
      }
      function CCommandMenu({ s }) {
        if (!s.menu) return null;
        const node = s.menu.node;
        const items = [];
        window.COMMAND_GROUPS.forEach((g, gi) => {
          if (gi)
            items.push({
              type: 'separator',
            });
          items.push({
            type: 'label',
            label: g.label,
          });
          g.commands.forEach((c) =>
            items.push({
              id: c,
              label: c,
              icon: ACTION_ICONS[c],
              mono: true,
            }),
          );
        });
        items.push({
          type: 'separator',
        });
        items.push({
          id: '__ai',
          label: 'Ask Conductor about this element',
          icon: 'sparkles',
          ai: true,
        });
        return /*#__PURE__*/ React.createElement(
          React.Fragment,
          null,
          /*#__PURE__*/ React.createElement('div', {
            style: {
              position: 'fixed',
              inset: 0,
              zIndex: 70,
            },
            onClick: () => s.setMenu(null),
            onContextMenu: (e) => {
              e.preventDefault();
              s.setMenu(null);
            },
          }),
          /*#__PURE__*/ React.createElement(ContextMenu, {
            x: s.menu.x,
            y: s.menu.y,
            title: node.kind + ' · "' + node.text + '"',
            items: items,
            onSelect: (item) => {
              if (item.id === '__ai') s.ask('What can I assert about ' + node.selector + '?');
              else s.appendStep(item.id, node);
              s.setMenu(null);
            },
          }),
        );
      }
      function CFlowMenu({ s }) {
        if (!s.rowMenu) return null;
        return /*#__PURE__*/ React.createElement(
          React.Fragment,
          null,
          /*#__PURE__*/ React.createElement('div', {
            style: {
              position: 'fixed',
              inset: 0,
              zIndex: 70,
            },
            onClick: () => s.setRowMenu(null),
            onContextMenu: (e) => {
              e.preventDefault();
              s.setRowMenu(null);
            },
          }),
          /*#__PURE__*/ React.createElement(ContextMenu, {
            x: s.rowMenu.x,
            y: s.rowMenu.y,
            width: 196,
            items: [
              {
                id: 'open',
                label: 'Open in editor',
                icon: 'file-code',
              },
              {
                id: 'rename',
                label: 'Rename…',
                icon: 'pencil',
              },
              {
                id: 'duplicate',
                label: 'Duplicate',
                icon: 'copy',
              },
              {
                type: 'separator',
              },
              {
                id: 'run',
                label: 'Run now',
                icon: 'play',
              },
              {
                type: 'separator',
              },
              {
                id: 'delete',
                label: 'Delete flow',
                icon: 'trash-2',
                destructive: true,
              },
            ],
            onSelect: (item) => {
              if (item.id === 'open') s.openTest(s.rowMenu.id);
              if (item.id === 'run') {
                s.openTest(s.rowMenu.id);
                s.run();
              }
              if (item.id === 'delete') s.setTests((t) => t.filter((x) => x.id !== s.rowMenu.id));
              if (item.id === 'duplicate') {
                const src = s.tests.find((x) => x.id === s.rowMenu.id);
                if (src)
                  s.setTests((t) => [
                    {
                      ...src,
                      id: src.id + '-copy',
                      name: src.name.replace('.yaml', '-copy.yaml'),
                      lastResult: 'never',
                      duration: undefined,
                    },
                    ...t,
                  ]);
              }
              s.setRowMenu(null);
            },
          }),
        );
      }
      function CDevices({ s }) {
        const [scan, setScan] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          Dialog,
          {
            open: s.deviceDialog,
            icon: 'smartphone',
            title: 'Devices',
            subtitle: 'Conductor talks to Android over adb. Plug in a phone or start an emulator.',
            onClose: () => s.setDeviceDialog(false),
            footer: /*#__PURE__*/ React.createElement(
              React.Fragment,
              null,
              /*#__PURE__*/ React.createElement(
                Button,
                {
                  variant: 'ghost',
                  onClick: () => s.setDeviceDialog(false),
                },
                'Cancel',
              ),
              /*#__PURE__*/ React.createElement(
                Button,
                {
                  variant: 'primary',
                  icon: 'refresh-cw',
                  loading: scan,
                  onClick: () => {
                    setScan(true);
                    setTimeout(() => setScan(false), 900);
                  },
                },
                'Scan again',
              ),
            ),
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gap: 8,
              },
            },
            [
              {
                serial: 'R9QYC01EMXL',
                model: 'Galaxy S23 · Android 14',
                state: 'connected',
              },
              {
                serial: 'emulator-5554',
                model: 'Pixel 7 API 34 · Android 14',
                state: 'offline',
              },
            ].map((d) =>
              /*#__PURE__*/ React.createElement(
                'button',
                {
                  key: d.serial,
                  type: 'button',
                  onClick: () => {
                    s.setDevice({
                      serial: d.serial,
                      state: d.state,
                    });
                    s.setDeviceDialog(false);
                  },
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-5)',
                    padding: '11px 14px',
                    textAlign: 'left',
                    borderRadius: 'var(--a-radius-surface)',
                    background:
                      d.serial === s.device.serial ? 'var(--accent-quiet)' : 'var(--a-well)',
                    border:
                      '1px solid ' +
                      (d.serial === s.device.serial ? 'var(--accent-edge)' : 'var(--a-hair)'),
                    cursor: 'pointer',
                  },
                },
                /*#__PURE__*/ React.createElement(StatusDot, {
                  state: d.state,
                  size: 8,
                }),
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      display: 'grid',
                      gap: 2,
                      flex: 1,
                    },
                  },
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        font: 'var(--type-code-sm)',
                        color: 'var(--text-primary)',
                      },
                    },
                    d.serial,
                  ),
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        font: 'var(--type-caption)',
                        color: 'var(--text-tertiary)',
                      },
                    },
                    d.model,
                  ),
                ),
                d.serial === s.device.serial
                  ? /*#__PURE__*/ React.createElement(Icon, {
                      name: 'check',
                      size: 14,
                      color: 'var(--accent)',
                    })
                  : null,
              ),
            ),
            /*#__PURE__*/ React.createElement(Checkbox, {
              checked: true,
              label: 'Reconnect automatically',
              hint: 'Conductor re-attaches when the device reappears on adb.',
            }),
          ),
        );
      }

      /* Light/dark is a property of the window, so it lives with the window controls, not in a
   settings screen. Persisted, because nobody wants to re-pick it every launch. */
      function useAuroraTheme() {
        const [dark, setDark] = React.useState(
          () => localStorage.getItem('conductor.aurora.dark') === '1',
        );
        React.useEffect(() => {
          document.documentElement.dataset.theme = dark ? 'aurora-dark' : 'aurora';
          localStorage.setItem('conductor.aurora.dark', dark ? '1' : '0');
        }, [dark]);
        return [dark, setDark];
      }

      /* Real traffic lights: fixed macOS hues, 12px, with a faint darker rim so they read on glass. */
      const LIGHTS = [
        {
          key: 'close',
          fill: 'oklch(65% 0.200 24)',
          rim: 'oklch(52% 0.180 24)',
        },
        {
          key: 'min',
          fill: 'oklch(82% 0.150 85)',
          rim: 'oklch(66% 0.140 78)',
        },
        {
          key: 'max',
          fill: 'oklch(76% 0.170 145)',
          rim: 'oklch(60% 0.150 145)',
        },
      ];
      function CToolbar({ s, dark, setDark }) {
        const active = s.tabs.find((t) => t.id === s.activeTab);
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 52,
              padding: '0 10px 0 14px',
              background: 'var(--a-chrome)',
              borderBottom: A_HAIR,
              flex: 'none',
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              },
            },
            LIGHTS.map((l) =>
              /*#__PURE__*/ React.createElement('span', {
                key: l.key,
                style: {
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: l.fill,
                  boxShadow: 'inset 0 0 0 0.5px ' + l.rim,
                },
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            Tooltip,
            {
              content: s.flows ? 'Hide sidebar' : 'Show sidebar',
              shortcut: '\u2318B',
            },
            /*#__PURE__*/ React.createElement(IconButton, {
              icon: 'panel-left',
              label: 'Toggle sidebar',
              selected: s.flows,
              onClick: s.toggleFlows,
            }),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gap: 1,
                minWidth: 0,
                marginLeft: 4,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-body-strong)',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              active ? active.label : 'Conductor',
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  font: 'var(--type-mono-label)',
                  color: 'var(--text-disabled)',
                },
              },
              s.commandCount(),
              ' commands \xB7 ',
              s.running ? 'running' : 'saved to suite',
            ),
          ),
          /*#__PURE__*/ React.createElement('span', {
            style: {
              flex: 1,
            },
          }),
          /*#__PURE__*/ React.createElement(window.CDoctorBadge, {
            count: window.DOCTOR_ISSUES,
            selected: s.doctor,
            onClick: () => s.setDoctor((v) => !v),
          }),
          /*#__PURE__*/ React.createElement(
            'button',
            {
              type: 'button',
              onClick: () => s.setEnv(s.env === 'staging' ? 'prod' : 'staging'),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 28,
                padding: '0 11px',
                background: 'var(--a-well)',
                border: A_HAIR,
                borderRadius: 'var(--a-radius-field)',
                cursor: 'pointer',
                font: 'var(--type-caption)',
                color: 'var(--text-secondary)',
              },
            },
            /*#__PURE__*/ React.createElement(Icon, {
              name: 'variable',
              size: 12,
              color: 'var(--text-tertiary)',
            }),
            s.env,
            /*#__PURE__*/ React.createElement(Icon, {
              name: 'chevron-down',
              size: 12,
              color: 'var(--text-tertiary)',
            }),
          ),
          /*#__PURE__*/ React.createElement(
            'button',
            {
              type: 'button',
              onClick: s.running ? undefined : s.run,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 28,
                padding: '0 13px',
                borderRadius: 'var(--a-radius-field)',
                cursor: 'pointer',
                font: 'var(--type-body-strong)',
                border: '1px solid transparent',
                background: s.running ? 'var(--state-fail-quiet)' : 'var(--accent)',
                color: s.running ? 'var(--state-fail)' : 'var(--accent-on)',
                boxShadow: s.running ? 'none' : 'var(--a-refract)',
              },
            },
            /*#__PURE__*/ React.createElement(Icon, {
              name: s.running ? 'circle-stop' : 'play',
              size: 13,
              color: s.running ? 'var(--state-fail)' : 'var(--accent-on)',
            }),
            s.running ? 'Stop' : 'Run',
          ),
          /*#__PURE__*/ React.createElement('span', {
            style: {
              width: 1,
              height: 20,
              background: 'var(--a-hair)',
            },
          }),
          /*#__PURE__*/ React.createElement(
            Tooltip,
            {
              content: dark ? 'Light appearance' : 'Dark appearance',
            },
            /*#__PURE__*/ React.createElement(IconButton, {
              icon: dark ? 'sun' : 'moon',
              label: 'Toggle dark mode',
              onClick: () => setDark((v) => !v),
            }),
          ),
          /*#__PURE__*/ React.createElement(
            Tooltip,
            {
              content: 'Save flow',
              shortcut: '\u2318S',
            },
            /*#__PURE__*/ React.createElement(IconButton, {
              icon: 'download',
              label: 'Save flow',
            }),
          ),
        );
      }
      function StudioC({ doctor = false, doctorVariant = 'a' }) {
        const s = useStudioC({
          doctor,
        });
        const DoctorSheet =
          doctorVariant === 'b' && window.CDoctorSheetB
            ? window.CDoctorSheetB
            : window.CDoctorSheet;
        const [dark, setDark] = useAuroraTheme();
        const total = s.commandCount() || 1;
        const pct = s.running ? Math.min(100, Math.round((s.steps.length / total) * 100)) : 0;
        const cols = s.flows
          ? 'minmax(200px, 268px) 1px minmax(0, 1fr) 1px auto'
          : 'minmax(0, 1fr) 1px auto';
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            ref: s.frame.ref,
            style: {
              position: 'relative',
              height: '100vh',
              overflow: 'hidden',
              background: 'var(--bg-window)',
              display: 'grid',
              padding: 22,
              boxSizing: 'border-box',
            },
          },
          /*#__PURE__*/ React.createElement('div', {
            className: 'a-wash',
          }),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              className: 'a-rim',
              style: {
                position: 'relative',
                zIndex: 1,
                display: 'grid',
                gridTemplateRows: 'auto minmax(0, 1fr)',
                minHeight: 0,
                overflow: 'hidden',
                borderRadius: 'var(--a-radius-window)',
                background: 'var(--a-panel)',
                backdropFilter: 'blur(var(--a-blur)) saturate(var(--a-saturate))',
                WebkitBackdropFilter: 'blur(var(--a-blur)) saturate(var(--a-saturate))',
                boxShadow: 'var(--shadow-window)',
              },
            },
            /*#__PURE__*/ React.createElement(CToolbar, {
              s: s,
              dark: dark,
              setDark: setDark,
            }),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: cols,
                  minHeight: 0,
                },
              },
              /*#__PURE__*/ React.createElement('div', {
                style: {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: 2,
                  background: 'var(--accent)',
                  width: pct + '%',
                  opacity: s.running ? 1 : 0,
                  transition:
                    'width var(--dur-slow) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
                  zIndex: 5,
                },
              }),
              s.flows
                ? /*#__PURE__*/ React.createElement(
                    React.Fragment,
                    null,
                    /*#__PURE__*/ React.createElement(CFlows, {
                      s: s,
                    }),
                    /*#__PURE__*/ React.createElement('span', {
                      style: {
                        background: 'var(--a-hair)',
                      },
                    }),
                  )
                : null,
              /*#__PURE__*/ React.createElement(CEditorColumn, {
                s: s,
              }),
              /*#__PURE__*/ React.createElement('span', {
                style: {
                  background: 'var(--a-hair)',
                },
              }),
              /*#__PURE__*/ React.createElement(CDevice, {
                s: s,
              }),
              /*#__PURE__*/ React.createElement(DoctorSheet, {
                open: s.doctor,
                onClose: () => s.setDoctor(false),
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(CCommandMenu, {
            s: s,
          }),
          /*#__PURE__*/ React.createElement(CFlowMenu, {
            s: s,
          }),
          /*#__PURE__*/ React.createElement(CDevices, {
            s: s,
          }),
        );
      }
      Object.assign(window, {
        StudioC,
        useStudioC,
      });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/conductor-c-aurora/CShell.jsx',
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/conductor-c-aurora/data.jsx
  try {
    (() => {
      /* Fixture data for the Conductor Studio recreation. Content mirrors the reference
   screenshot of the pnp-fast-mode project, in the team's own Portuguese copy. */
      const FLOW_START = 'appId: com.example.app\n---\n- launchApp:\n    clearState: true\n';

      /* The project's suite. Sorted by last run, most recent first — people come back to what they
   just broke, not to what is alphabetically first. */
      const TESTS = [
        {
          id: 'f-teste',
          name: 'teste.yaml',
          steps: 4,
          lastResult: 'fail',
          lastRun: 'Jul 28, 12:29 pm',
          duration: '0:04',
          open: true,
        },
        {
          id: 'f-pedidos',
          name: 'pedidos-pendentes.yaml',
          steps: 11,
          lastResult: 'pass',
          lastRun: 'Jul 28, 11:02 am',
          duration: '0:38',
        },
        {
          id: 'f-checkout',
          name: 'checkout.yaml',
          steps: 17,
          lastResult: 'pass',
          lastRun: 'Jul 27, 6:41 pm',
          duration: '1:12',
        },
        {
          id: 'f-separacao',
          name: 'separacao.yaml',
          steps: 9,
          lastResult: 'fail',
          lastRun: 'Jul 27, 6:38 pm',
          duration: '0:21',
        },
        {
          id: 'f-login',
          name: 'login.yaml',
          steps: 6,
          lastResult: 'pass',
          lastRun: 'Jul 27, 9:15 am',
          duration: '0:14',
        },
        {
          id: 'f-retirada',
          name: 'retirada-loja.yaml',
          steps: 8,
          lastResult: 'pass',
          lastRun: 'Jul 25, 4:02 pm',
          duration: '0:26',
          aiAuthored: true,
        },
        {
          id: 'f-busca',
          name: 'busca-produto.yaml',
          steps: 5,
          lastResult: 'never',
          aiAuthored: true,
        },
      ];

      /* The selector the assistant falls back to when nothing is hovered. Neither geometry nor the
   node count is stored here — both are measured from the DOM. */
      const A11Y_FALLBACK = {
        id: 'due0',
        kind: 'Text',
        text: 'Preparar até 3:30 PM',
        selector: 'text: "Preparar até 3:30 PM"',
      };
      const COMMAND_GROUPS = [
        {
          label: 'Interact',
          commands: ['tapOn', 'doubleTapOn', 'longPressOn', 'inputText'],
        },
        {
          label: 'Assert',
          commands: ['assertVisible', 'assertNotVisible'],
        },
        {
          label: 'Wait',
          commands: ['waitForAnimationToEnd', 'extendedWaitUntil'],
        },
        {
          label: 'App',
          commands: ['takeScreenshot', 'copyTextFrom'],
        },
      ];
      const SNIPPETS = {
        tapOn: (n) => '- tapOn:\n    ' + n.selector,
        doubleTapOn: (n) => '- doubleTapOn:\n    ' + n.selector,
        longPressOn: (n) => '- longPressOn:\n    ' + n.selector,
        inputText: (n) => '- tapOn:\n    ' + n.selector + '\n- inputText: ""',
        assertVisible: (n) => '- assertVisible:\n    ' + n.selector,
        assertNotVisible: (n) => '- assertNotVisible:\n    ' + n.selector,
        waitForAnimationToEnd: () => '- waitForAnimationToEnd',
        extendedWaitUntil: (n) =>
          '- extendedWaitUntil:\n    visible:\n      ' + n.selector + '\n    timeout: 10000',
        takeScreenshot: () => '- takeScreenshot: pedidos',
        copyTextFrom: (n) => '- copyTextFrom:\n    ' + n.selector,
      };
      const STEP_LABELS = {
        launchApp: 'Launch app "com.example.app" with clear state',
        tapOn: 'Tap on',
        doubleTapOn: 'Double tap on',
        longPressOn: 'Long press on',
        assertVisible: 'Assert visible',
        assertNotVisible: 'Assert not visible',
        waitForAnimationToEnd: 'Wait for animation to end',
        extendedWaitUntil: 'Wait until visible',
        takeScreenshot: 'Take screenshot',
        copyTextFrom: 'Copy text from',
        inputText: 'Input text',
      };
      Object.assign(window, {
        FLOW_START,
        TESTS,
        A11Y_FALLBACK,
        COMMAND_GROUPS,
        SNIPPETS,
        STEP_LABELS,
      });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/conductor-c-aurora/data.jsx',
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/conductor-c-aurora/useInspector.jsx
  try {
    (() => {
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
          const tally = () => setCount(box.querySelectorAll('[data-a11y-id]').length);
          tally();
          const mo = new MutationObserver(tally);
          mo.observe(box, {
            childList: true,
            subtree: true,
          });
          return () => mo.disconnect();
        }, []);
        const read = (target) => {
          const el = target && target.closest ? target.closest('[data-a11y-id]') : null;
          const box = contentRef.current;
          if (!el || !box) return null;
          const b = box.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          /* The mirror may be CSS-scaled; getBoundingClientRect is post-transform, but `highlight`
       is positioned in the content box's own coordinates. Divide the scale back out. */
          const k = box.offsetWidth ? b.width / box.offsetWidth : 1;
          return {
            id: el.getAttribute('data-a11y-id'),
            kind: el.getAttribute('data-a11y-kind'),
            text: el.getAttribute('data-a11y-text'),
            selector: el.getAttribute('data-a11y-selector'),
            rect: {
              x: (r.left - b.left) / k,
              y: (r.top - b.top) / k,
              width: r.width / k,
              height: r.height / k,
            },
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
          onMouseOut: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setHover(null);
          },
          onPick: (e) => {
            const n = read(e.target);
            setPinned((p) => (n && p && p.id === n.id ? null : n));
          },
          onContext: (e, open) => {
            e.preventDefault();
            const n = read(e.target);
            if (n)
              open({
                x: e.clientX,
                y: e.clientY,
                node: n,
              });
          },
        };
      }

      /* A device mirror shows the device's own pixels, scaled — never a reflowed layout. So the phone
   keeps a FIXED logical size and only its scale changes to fit the bay it is given. */
      const DEVICE = {
        width: 330,
        height: 648,
        bezel: 8,
      };
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
          transform: {
            transform: 'scale(' + scale + ')',
            transformOrigin: 'top left',
          },
        };
      }
      Object.assign(window, {
        useInspector,
        useMirrorFit,
      });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/conductor-c-aurora/useInspector.jsx',
      error: String((e && e.message) || e),
    });
  }

  __ds_ns.Badge = __ds_scope.Badge;

  __ds_ns.Button = __ds_scope.Button;

  __ds_ns.Checkbox = __ds_scope.Checkbox;

  __ds_ns.ICONS = __ds_scope.ICONS;

  __ds_ns.ICON_NAMES = __ds_scope.ICON_NAMES;

  __ds_ns.ACTION_ICONS = __ds_scope.ACTION_ICONS;

  __ds_ns.Icon = __ds_scope.Icon;

  __ds_ns.IconButton = __ds_scope.IconButton;

  __ds_ns.Input = __ds_scope.Input;

  __ds_ns.Kbd = __ds_scope.Kbd;

  __ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

  __ds_ns.Select = __ds_scope.Select;

  __ds_ns.StatusDot = __ds_scope.StatusDot;

  __ds_ns.Switch = __ds_scope.Switch;

  __ds_ns.Tooltip = __ds_scope.Tooltip;

  __ds_ns.ChatComposer = __ds_scope.ChatComposer;

  __ds_ns.ChatMessage = __ds_scope.ChatMessage;

  __ds_ns.DeviceMirror = __ds_scope.DeviceMirror;

  __ds_ns.DeviceSelector = __ds_scope.DeviceSelector;

  __ds_ns.FileTree = __ds_scope.FileTree;

  __ds_ns.LogStream = __ds_scope.LogStream;

  __ds_ns.RunBar = __ds_scope.RunBar;

  __ds_ns.TestList = __ds_scope.TestList;

  __ds_ns.TitleBar = __ds_scope.TitleBar;

  __ds_ns.YamlEditor = __ds_scope.YamlEditor;

  __ds_ns.ContextMenu = __ds_scope.ContextMenu;

  __ds_ns.Dialog = __ds_scope.Dialog;

  __ds_ns.Divider = __ds_scope.Divider;

  __ds_ns.EmptyState = __ds_scope.EmptyState;

  __ds_ns.GlassPanel = __ds_scope.GlassPanel;

  __ds_ns.PanelHeader = __ds_scope.PanelHeader;

  __ds_ns.TabStrip = __ds_scope.TabStrip;

  __ds_ns.Toolbar = __ds_scope.Toolbar;
})();

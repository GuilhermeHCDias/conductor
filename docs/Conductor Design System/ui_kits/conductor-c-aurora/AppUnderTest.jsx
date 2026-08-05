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
  return (
    <div
      {...a11y('card' + index, 'View', 'Pedido ' + code, 'id: "order-card-' + index + '"')}
      style={{
        borderRadius: 12,
        background: 'oklch(100% 0 0 / 0.045)',
        border: '1px solid oklch(100% 0 0 / 0.09)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 12px 10px', display: 'grid', gap: 4 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <span
            {...a11y(
              'due' + index,
              'Text',
              'Preparar até ' + due,
              'text: "Preparar até ' + due + '"',
            )}
            style={{
              font: 'var(--w-medium) 12px/1.3 var(--font-ui)',
              color: 'oklch(78% 0.004 265)',
            }}
          >
            Preparar até {due}
          </span>
          <span
            {...a11y(
              'open' + index,
              'Button',
              'Abrir pedido ' + code,
              'id: "order-open-' + index + '"',
            )}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 22,
              height: 22,
              borderRadius: 6,
              border: '1px solid oklch(100% 0 0 / 0.14)',
              color: 'oklch(70% 0.005 265)',
            }}
          >
            <Icon name="chevron-right" size={12} />
          </span>
        </div>
        <span
          {...a11y('code' + index, 'Text', code, 'text: "' + code + '"')}
          style={{
            font: 'var(--w-semibold) 14px/1.3 var(--font-ui)',
            color: 'oklch(97% 0.001 265)',
            justifySelf: 'start',
          }}
        >
          {code}
        </span>
        <span
          {...a11y('person' + index, 'Text', person, 'text: "' + person + '"')}
          style={{
            font: 'var(--w-regular) 12px/1.3 var(--font-ui)',
            color: 'oklch(62% 0.006 265)',
            justifySelf: 'start',
          }}
        >
          {person}
        </span>
      </div>
      <div style={{ height: 1, background: 'oklch(100% 0 0 / 0.07)', margin: '0 12px' }} />
      <div style={{ padding: '10px 12px 12px', display: 'grid', gap: 4 }}>
        <span
          {...a11y('mode' + index, 'Text', mode, 'text: "' + mode + '"')}
          style={{
            font: 'var(--w-regular) 12px/1.3 var(--font-ui)',
            color: 'oklch(62% 0.006 265)',
            justifySelf: 'start',
          }}
        >
          {mode}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            {...a11y('items' + index, 'Text', items, 'text: "' + items + '"')}
            style={{
              font: 'var(--w-regular) 12px/1.3 var(--font-ui)',
              color: 'oklch(70% 0.005 265)',
            }}
          >
            {items}
          </span>
          <span style={{ display: 'flex', gap: 10, color: 'oklch(58% 0.006 265)' }}>
            <Icon name="filter" size={13} />
            <Icon name="zap" size={13} />
          </span>
        </div>
      </div>
    </div>
  );
}

function AppUnderTest() {
  return (
    <div
      style={{
        height: '100%',
        minHeight: '100%',
        background: 'oklch(13% 0.008 265)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 8px' }}>
        <span
          {...a11y('title', 'Text', 'Pedidos pendentes', 'text: "Pedidos pendentes"')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flex: 1,
            font: 'var(--w-bold) 16px/1.2 var(--font-display)',
            letterSpacing: '-0.02em',
            color: 'oklch(97% 0.001 265)',
          }}
        >
          Pedidos pendentes
          <Icon name="chevron-down" size={13} color="oklch(70% 0.005 265)" />
        </span>
        <span
          {...a11y('search', 'Button', 'Buscar', 'id: "search-button"')}
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 24,
            height: 24,
            color: 'oklch(78% 0.004 265)',
          }}
        >
          <Icon name="search" size={17} />
        </span>
        <span
          {...a11y('menu', 'Button', 'Menu', 'id: "orders-menu"')}
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 24,
            height: 24,
            color: 'oklch(78% 0.004 265)',
          }}
        >
          <Icon name="ellipsis-vertical" size={17} />
        </span>
      </div>
      <div style={{ display: 'grid', alignContent: 'start', gap: 12, padding: '6px 12px' }}>
        <OrderCard
          index={0}
          due="3:30 PM"
          code="SLR 701-001"
          person="John Doe"
          mode="Entrega · FedEx"
          items="4 produtos · 9 unidades"
        />
        <OrderCard
          index={1}
          due="4:15 PM"
          code="SLR 701-002"
          person="John Doe"
          mode="Retirada"
          items="2 produtos · 3 unidades"
        />
      </div>
    </div>
  );
}

Object.assign(window, { AppUnderTest });

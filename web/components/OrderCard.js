import { inr } from '../lib/api';

const STEPS = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];
const LABEL = { PENDING_PAYMENT: 'Awaiting payment', PAYMENT_FAILED: 'Payment failed', CANCELLED: 'Cancelled' };

export default function OrderCard({ order }) {
  const step = STEPS.indexOf(order.status);
  return (
    <div className="panel">
      <div className="row-between">
        <strong className="num">{order.orderNumber}</strong>
        <span className="muted small num">
          {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {inr(order.amounts.total)}
        </span>
      </div>
      {step >= 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {STEPS.map((s, i) => (
            <div key={s} className="small" style={{ borderTop: `4px solid var(${i <= step ? '--brand' : '--line'})`, paddingTop: 6, fontWeight: 600, color: `var(${i <= step ? '--ink' : '--muted'})` }}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </div>
          ))}
        </div>
      ) : (
        <span className="status">{LABEL[order.status] ?? order.status}</span>
      )}
      {order.items.map((i) => (
        <div key={i.productId} className="row-between small">
          <span>{i.title} × {i.qty}</span>
          <span className="num">{inr(i.price * i.qty)}</span>
        </div>
      ))}
    </div>
  );
}

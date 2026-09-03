import type { UIState } from '../store';
import { t } from '../i18n';

export default function CategoryGrid({ store }: { store: UIState }) {
  const title = t(store.strings, 'categories_label');

  return (
    <section className="categories" aria-label={title}>
      <h2 className="section-title">{title}</h2>
      <div className="category-grid">
        {store.categories.map((cat) => (
          <div key={cat.id} className={`category-card category-${cat.id}`}>
            {cat.count > 0 && <span className="category-count">{cat.count}</span>}
            <span className="category-icon" aria-hidden="true">
              {cat.icon}
            </span>
            <div className="category-body">
              <span className="category-name">{cat.name}</span>
              {cat.extensions.length > 0 && (
                <span className="category-ext">{cat.extensions.join(' ')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

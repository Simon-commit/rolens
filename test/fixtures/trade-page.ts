/**
 * Simplified markup modelled on the Roblox trades page. It only keeps the structure
 * RoLens relies on (see src/content/selectors.ts).
 */
function card(id: number, name: string): string {
  return `
    <div class="item-card-container">
      <a class="item-card-link" href="https://www.roblox.com/catalog/${id}/${name.replace(/ /g, '-')}">
        <div class="item-card-thumb-container"><img alt="${name}"></div>
      </a>
      <div class="item-card-caption">
        <a class="item-card-name-link" href="/catalog/${id}"><div class="item-card-name">${name}</div></a>
        <div class="item-card-price">RAP 0</div>
      </div>
    </div>`;
}

export const tradePage = `
  <div class="trades-list-detail">
    <div class="trade-list-detail-offer">
      <h3 class="trade-list-detail-offer-header">Items you will give</h3>
      ${card(1, 'Valued Hat')}
      ${card(2, 'Unvalued Hat')}
    </div>
    <div class="trade-list-detail-offer">
      <h3 class="trade-list-detail-offer-header">Items you will receive</h3>
      ${card(3, 'Projected Hat')}
      ${card(999, 'Not A Limited')}
    </div>
  </div>`;

export const itemPage = `
  <div id="item-container">
    <div class="item-details-name-row"><h1>The Classic ROBLOX Fedora</h1></div>
    ${card(1, 'Valued Hat')}
  </div>`;

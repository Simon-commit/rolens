// Minimal Roblox-like markup for the smoke test; mirrors test/fixtures/trade-page.ts.
function card(id, name) {
  return `<div class="item-card-container">
    <a class="item-card-link" href="https://www.roblox.com/catalog/${id}/x"><div class="thumb"></div></a>
    <div class="item-card-caption">
      <a class="item-card-name-link" href="/catalog/${id}"><div class="item-card-name">${name}</div></a>
    </div>
  </div>`;
}

export const tradePage = `
  <div class="trade-list-detail-offer">
    <h3 class="trade-list-detail-offer-header">Items you will give</h3>
    ${card(1, 'Valued Hat')}${card(2, 'Unvalued Hat')}
  </div>
  <div class="trade-list-detail-offer">
    <h3 class="trade-list-detail-offer-header">Items you will receive</h3>
    ${card(3, 'Projected Hat')}${card(999, 'Not A Limited')}
  </div>`;

export const itemPage = `
  <div id="item-container">
    <div class="item-details-name-row"><h1>Valued Hat</h1></div>
  </div>`;

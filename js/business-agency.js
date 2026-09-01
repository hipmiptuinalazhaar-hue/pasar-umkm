'use strict';

(() => {
  if (typeof STATE === 'undefined') return;

  const AGENCY = {
    cashbook: null
  };

  function esc(value) {
    return typeof escapeHTML === 'function'
      ? escapeHTML(String(value ?? ''))
      : String(value ?? '');
  }

  function money(value) {
    return typeof formatRupiah === 'function'
      ? formatRupiah(Number(value || 0))
      : `Rp${Number(value || 0).toLocaleString('id-ID')}`;
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json' };
    const config = {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      throw new Error(data.error || 'AI Agency Bisnis belum dapat diproses.');
    }

    return data;
  }

  function decorateHighlight() {
    document
      .querySelectorAll('.social-account-highlights .social-account-highlight')
      .forEach(button => {
        const label = button.querySelector('.social-account-highlight-label');

        if (!label || label.textContent.trim() !== 'Toko') return;

        label.textContent = 'AI Agency Bisnis';
        button.removeAttribute('data-menu-action');
        button.dataset.businessAgencyAction = 'open';

        const icon = button.querySelector('.social-account-highlight-inner i');
        if (icon) icon.className = 'ph ph-brain';
      });
  }

  function openAgency() {
    if (!STATE.user) {
      if (typeof openLogin === 'function') openLogin();
      return;
    }

    openBottomSheet(
      `
        <h2 id="sheetTitle">AI Agency Bisnis</h2>
        <p class="empty-state-text">Alat bantu keputusan dan pencatatan usaha.</p>

        <button type="button" class="menu-sheet-btn" data-business-agency-action="calculator">
          <i class="ph ph-calculator"></i> Kalkulator
        </button>

        <button type="button" class="menu-sheet-btn" data-business-agency-action="bep">
          <i class="ph ph-chart-line-up"></i> Hitung BEP
        </button>

        <button type="button" class="menu-sheet-btn" data-business-agency-action="selling-price">
          <i class="ph ph-tag"></i> Hitung Harga Jual
        </button>

        <button type="button" class="menu-sheet-btn" data-business-agency-action="cashbook">
          <i class="ph ph-book-open-text"></i> Buku Kas
        </button>
      `,
      'business-agency'
    );
  }

  function openCalculator() {
    openBottomSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Kalkulator</h2>
          <form id="agencyCalculatorForm">
            <div class="auth-field">
              <label>Perhitungan</label>
              <input class="auth-input" name="expression" inputmode="decimal" placeholder="Contoh: (25000 * 12) - 50000" required>
            </div>
            <button type="submit" class="btn-primary" style="width:100%;">Hitung</button>
          </form>
          <div id="agencyCalculatorResult" class="product-card" hidden></div>
        </section>
      `,
      'business-calculator'
    );
  }

  function openBep() {
    openBottomSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Hitung BEP</h2>
          <form id="agencyBepForm">
            <div class="auth-field"><label>Biaya tetap</label><input class="auth-input" name="fixed" type="number" min="0" step="any" required></div>
            <div class="auth-field"><label>Harga jual per unit</label><input class="auth-input" name="price" type="number" min="0" step="any" required></div>
            <div class="auth-field"><label>Biaya variabel per unit</label><input class="auth-input" name="variable" type="number" min="0" step="any" required></div>
            <button type="submit" class="btn-primary" style="width:100%;">Hitung BEP</button>
          </form>
          <div id="agencyBepResult" class="product-card" hidden></div>
        </section>
      `,
      'business-bep'
    );
  }

  function openSellingPrice() {
    openBottomSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Hitung Harga Jual</h2>
          <form id="agencySellingPriceForm">
            <div class="auth-field"><label>Modal / HPP per unit</label><input class="auth-input" name="cost" type="number" min="0" step="any" required></div>
            <div class="auth-field"><label>Target keuntungan (%)</label><input class="auth-input" name="margin" type="number" min="0" step="any" required></div>
            <button type="submit" class="btn-primary" style="width:100%;">Hitung Harga Jual</button>
          </form>
          <div id="agencySellingPriceResult" class="product-card" hidden></div>
        </section>
      `,
      'business-selling-price'
    );
  }

  function cashbookEntryTemplate(item) {
    const income = item.entry_type === 'income';
    return `
      <section class="product-card">
        <div class="product-info">
          <div class="product-badge">${income ? 'Pemasukan' : 'Pengeluaran'}</div>
          <div class="product-name">${esc(item.category || item.description || 'Transaksi')}</div>
          <div class="product-meta">${esc(item.entry_date || '')}${item.description ? ` · ${esc(item.description)}` : ''}</div>
          <div class="product-price">${income ? '+' : '-'} ${money(item.amount)}</div>
        </div>
        <button type="button" class="btn-icon" data-business-agency-action="cash-delete" data-entry-id="${esc(item.id)}" aria-label="Hapus transaksi">
          <i class="ph ph-trash"></i>
        </button>
      </section>
    `;
  }

  async function openCashbook() {
    openBottomSheet(
      '<h2 id="sheetTitle">Buku Kas</h2><section class="empty-state"><i class="ph ph-spinner-gap"></i><strong class="empty-state-title">Memuat buku kas...</strong></section>',
      'business-cashbook'
    );

    try {
      const data = await api('/api/business-agency/cashbook');
      AGENCY.cashbook = data;
      renderCashbook(data);
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message);
    }
  }

  function renderCashbook(data) {
    const summary = data.summary || {};
    const entries = data.entries || [];
    const today = new Date().toISOString().slice(0, 10);

    openBottomSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Buku Kas</h2>

          <section class="product-card">
            <div class="product-info">
              <div class="product-meta">Total pemasukan: ${money(summary.total_income)}</div>
              <div class="product-meta">Total pengeluaran: ${money(summary.total_expense)}</div>
              <div class="product-price">Saldo: ${money(summary.balance)}</div>
            </div>
          </section>

          <form id="agencyCashbookForm">
            <div class="auth-field">
              <label>Jenis</label>
              <select class="auth-input" name="entry_type" required>
                <option value="income">Pemasukan</option>
                <option value="expense">Pengeluaran</option>
              </select>
            </div>
            <div class="auth-field"><label>Nominal</label><input class="auth-input" name="amount" type="number" min="1" step="any" required></div>
            <div class="auth-field"><label>Kategori</label><input class="auth-input" name="category" maxlength="100" placeholder="Contoh: Penjualan, Bahan baku"></div>
            <div class="auth-field"><label>Keterangan</label><input class="auth-input" name="description" maxlength="500"></div>
            <div class="auth-field"><label>Tanggal</label><input class="auth-input" name="entry_date" type="date" value="${today}" required></div>
            <button type="submit" class="btn-primary" style="width:100%;">Simpan Transaksi</button>
          </form>

          <button type="button" class="menu-sheet-btn" data-business-agency-action="cash-pdf" style="margin-top:12px;">
            <i class="ph ph-file-pdf"></i> Cetak Laporan Keuangan PDF
          </button>

          <h3 style="margin:16px 0 8px;">Riwayat</h3>
          ${entries.length ? entries.map(cashbookEntryTemplate).join('') : '<p class="empty-state-text">Belum ada transaksi.</p>'}
        </section>
      `,
      'business-cashbook'
    );
  }

  async function addCashEntry(form) {
    const fd = new FormData(form);
    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = true;
      button.textContent = 'Menyimpan...';
    }

    try {
      const data = await api('/api/business-agency/cashbook', {
        method: 'POST',
        body: {
          entry_type: fd.get('entry_type'),
          amount: Number(fd.get('amount')),
          category: fd.get('category'),
          description: fd.get('description'),
          entry_date: fd.get('entry_date')
        }
      });

      AGENCY.cashbook = data;
      renderCashbook(data);
      if (typeof showToast === 'function') showToast('Transaksi tersimpan.');
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message);
      if (button) {
        button.disabled = false;
        button.textContent = 'Simpan Transaksi';
      }
    }
  }

  async function deleteCashEntry(entryId) {
    try {
      const data = await api(`/api/business-agency/cashbook/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
      AGENCY.cashbook = data;
      renderCashbook(data);
      if (typeof showToast === 'function') showToast('Transaksi dihapus.');
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message);
    }
  }

  function asciiPdfText(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function createPdfBlob(lines) {
    const encoder = new TextEncoder();
    const pages = [];

    for (let i = 0; i < lines.length; i += 45) {
      pages.push(lines.slice(i, i + 45));
    }

    if (!pages.length) pages.push(['Laporan Keuangan']);

    const objects = [];
    const pageIds = pages.map((_, index) => 4 + (index * 2));
    const contentIds = pages.map((_, index) => 5 + (index * 2));

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    pages.forEach((pageLines, index) => {
      const content = [
        'BT',
        '/F1 10 Tf',
        '46 800 Td',
        ...pageLines.flatMap((line, lineIndex) => [
          `(${asciiPdfText(line).slice(0, 110)}) Tj`,
          lineIndex === pageLines.length - 1 ? '' : '0 -16 Td'
        ]).filter(Boolean),
        'ET'
      ].join('\n');

      objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
      objects[contentIds[index]] = `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`;
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    const maxId = objects.length - 1;

    for (let id = 1; id <= maxId; id += 1) {
      offsets[id] = encoder.encode(pdf).length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }

    const xrefOffset = encoder.encode(pdf).length;
    pdf += `xref\n0 ${maxId + 1}\n`;
    pdf += '0000000000 65535 f \n';

    for (let id = 1; id <= maxId; id += 1) {
      pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: 'application/pdf' });
  }

  function exportCashbookPdf() {
    const data = AGENCY.cashbook;
    if (!data) return;

    const summary = data.summary || {};
    const storeName = data.store?.name || STATE.currentStore?.name || STATE.user?.name || 'Usaha';
    const lines = [
      'LAPORAN KEUANGAN - PASAR UMKM',
      `Usaha: ${storeName}`,
      `Tanggal cetak: ${new Date().toLocaleDateString('id-ID')}`,
      '',
      `Total Pemasukan: ${money(summary.total_income)}`,
      `Total Pengeluaran: ${money(summary.total_expense)}`,
      `Saldo: ${money(summary.balance)}`,
      '',
      'RIWAYAT TRANSAKSI',
      ...((data.entries || []).map(item => {
        const sign = item.entry_type === 'income' ? '+' : '-';
        return `${item.entry_date || ''} | ${item.category || 'Transaksi'} | ${sign}${money(item.amount)} | ${item.description || ''}`;
      }))
    ];

    const blob = createPdfBlob(lines);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-keuangan-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-business-agency-action]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    switch (button.dataset.businessAgencyAction) {
      case 'open': openAgency(); break;
      case 'calculator': openCalculator(); break;
      case 'bep': openBep(); break;
      case 'selling-price': openSellingPrice(); break;
      case 'cashbook': openCashbook(); break;
      case 'cash-delete': deleteCashEntry(button.dataset.entryId); break;
      case 'cash-pdf': exportCashbookPdf(); break;
      default: break;
    }
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;

    if (form?.id === 'agencyCalculatorForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const expression = String(new FormData(form).get('expression') || '').trim();
      const result = form.parentElement?.querySelector('#agencyCalculatorResult');

      if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
        if (typeof showToast === 'function') showToast('Perhitungan hanya boleh berisi angka dan operator matematika.');
        return;
      }

      try {
        const value = Function(`"use strict"; return (${expression})`)();
        if (!Number.isFinite(Number(value))) throw new Error();
        if (result) {
          result.hidden = false;
          result.innerHTML = `<div class="product-info"><div class="product-meta">Hasil</div><div class="product-price">${Number(value).toLocaleString('id-ID')}</div></div>`;
        }
      } catch {
        if (typeof showToast === 'function') showToast('Perhitungan tidak valid.');
      }
      return;
    }

    if (form?.id === 'agencyBepForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const fd = new FormData(form);
      const fixed = Number(fd.get('fixed'));
      const price = Number(fd.get('price'));
      const variable = Number(fd.get('variable'));
      const result = form.parentElement?.querySelector('#agencyBepResult');

      if (!(fixed >= 0) || !(price > variable) || variable < 0) {
        if (typeof showToast === 'function') showToast('Harga jual harus lebih besar dari biaya variabel.');
        return;
      }

      const units = Math.ceil(fixed / (price - variable));
      const revenue = units * price;
      if (result) {
        result.hidden = false;
        result.innerHTML = `<div class="product-info"><div class="product-name">BEP ${units.toLocaleString('id-ID')} unit</div><div class="product-meta">Omzet minimum sekitar ${money(revenue)}</div></div>`;
      }
      return;
    }

    if (form?.id === 'agencySellingPriceForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const fd = new FormData(form);
      const cost = Number(fd.get('cost'));
      const margin = Number(fd.get('margin'));
      const result = form.parentElement?.querySelector('#agencySellingPriceResult');

      if (!(cost >= 0) || !(margin >= 0)) {
        if (typeof showToast === 'function') showToast('Nilai modal atau keuntungan tidak valid.');
        return;
      }

      const price = cost * (1 + (margin / 100));
      if (result) {
        result.hidden = false;
        result.innerHTML = `<div class="product-info"><div class="product-meta">Rekomendasi harga jual</div><div class="product-price">${money(price)}</div></div>`;
      }
      return;
    }

    if (form?.id === 'agencyCashbookForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      addCashEntry(form);
    }
  }, true);

  const observer = new MutationObserver(decorateHighlight);
  observer.observe(document.body, { childList: true, subtree: true });
  decorateHighlight();

  window.openBusinessAgency = openAgency;
})();

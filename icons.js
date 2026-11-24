/* =========================================================
   BỘ ICON SVG — nét đơn sắc kiểu SF Symbols
   Vẽ bằng nét (stroke) và lấy màu từ currentColor, nên đổi
   được theo token --icon-* của từng chế độ sáng/tối.
   Emoji thì trình duyệt khoá màu sẵn, không làm được việc này.
   ========================================================= */
var SVG_ICON = {
  pie:      '<circle cx="12" cy="12" r="9"/><path d="M12 12V3a9 9 0 0 1 9 9z"/>',
  chart:    '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  cot:      '<rect x="3" y="4" width="5" height="16" rx="1.5"/>'
          + '<rect x="9.5" y="4" width="5" height="11" rx="1.5"/>'
          + '<rect x="16" y="4" width="5" height="16" rx="1.5"/>',
  danhsach: '<path d="M8 6h13M8 12h13M8 18h13M3.6 6h.01M3.6 12h.01M3.6 18h.01"/>',
  gantt:    '<path d="M4 6h9M7 12h11M4 18h7"/>',
  lich:     '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  lap:      '<path d="M17 2l4 4-4 4"/><path d="M3 12v-2a4 4 0 0 1 4-4h14"/>'
          + '<path d="M7 22l-4-4 4-4"/><path d="M21 12v2a4 4 0 0 1-4 4H3"/>',
  chat:     '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  dongho:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  nhom:     '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.2"/>'
          + '<path d="M22 20v-2a4 4 0 0 0-3-3.87"/><path d="M16.5 3.9a4 4 0 0 1 0 6.2"/>',
  nguoi:    '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  caidat:   '<circle cx="12" cy="12" r="3.2"/>'
          + '<path d="M19.5 14.4a1.7 1.7 0 0 0 .34 1.87l.06.06a2.1 2.1 0 1 1-2.97 2.97l-.06-.06a1.7 1.7 0 0 0-1.87-.34'
          + ' 1.7 1.7 0 0 0-1.03 1.55V21a2.1 2.1 0 1 1-4.2 0v-.11a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06'
          + 'a2.1 2.1 0 1 1-2.97-2.97l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H3a2.1 2.1 0 1 1 0-4.2h.11'
          + 'a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2.1 2.1 0 1 1 2.97-2.97l.06.06a1.7 1.7 0 0 0 1.87.34'
          + 'h.08A1.7 1.7 0 0 0 10.3 3.6V3a2.1 2.1 0 1 1 4.2 0v.11a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06'
          + 'a2.1 2.1 0 1 1 2.97 2.97l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.55 1.03H21a2.1 2.1 0 1 1 0 4.2h-.11'
          + 'a1.7 1.7 0 0 0-1.55 1.03z"/>',
  nguon:    '<path d="M12 3v9"/><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>',
  menu:     '<path d="M3 6h18M3 12h18M3 18h18"/>',
  chuong:   '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  trang:    '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  mattroi:  '<circle cx="12" cy="12" r="4"/>'
          + '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  phieu:    '<path d="M3 4.5h18l-7 8V19l-4 2v-8.5z"/>',
  bang:     '<rect x="8" y="2" width="8" height="4" rx="1"/>'
          + '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  ghim:     '<path d="M12 17v5"/><path d="M9 2h6l-1 6 3.5 3.5V14H6.5v-2.5L10 8z"/>',
  tick:     '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
  canhbao:  '<path d="M10.3 3.9L1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'
          + '<path d="M12 9v4.5M12 17.4h.01"/>',
  phantram: '<path d="M19 5L5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
  mucdo:    '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"/>',
  toanha:   '<rect x="4" y="2" width="16" height="20" rx="1.5"/><path d="M9.5 22v-4h5v4"/>'
          + '<path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
  cup:      '<path d="M6 4h12v5a6 6 0 0 1-12 0z"/>'
          + '<path d="M6 6H3.6A2.4 2.4 0 0 0 6 10.4M18 6h2.4A2.4 2.4 0 0 1 18 10.4"/>'
          + '<path d="M12 15v4M9 21h6"/>',
  thumuc:   '<path d="M4 20h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2z"/>',
  lua:      '<path d="M12 22a7 7 0 0 0 7-7c0-5-4-6-4-11 0 0-3 2-3 6 0-2-2-3-2-3s-5 3-5 8a7 7 0 0 0 7 7z"/>',
  khien:    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  chiakhoa: '<circle cx="7.5" cy="15.5" r="4"/><path d="M10.5 12.5L21 2M17 6l3 3M14.5 8.5l2.5 2.5"/>',
  saolap:   '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'
          + '<path d="M18.6 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  anh:      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/>'
          + '<path d="M21 16l-5-5-9 9"/>',
  sach:     '<path d="M12 6.5V21"/>'
          + '<path d="M12 6.5C10.5 4.5 7.5 4 4 4.5V19c3.5-.5 6.5 0 8 2 1.5-2 4.5-2.5 8-2V4.5c-3.5-.5-6.5 0-8 2z"/>',
  butchi:   '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
  thu:      '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M3 7l9 6 9-6"/>',
  tep:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  lienket:  '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/>'
          + '<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12.2 19"/>',
  khoa:     '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mayin:    '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 15h12v6H6z"/>',
  quacau:   '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>'
          + '<path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  phonghop: '<rect x="3" y="4" width="18" height="14" rx="2"/>'
          + '<path d="M8 21h8M12 18v3"/><path d="M7.5 11.5h9M7.5 8h5"/>',
  cole:     '<path d="M14.7 6.3a4.5 4.5 0 0 0 5.9 5.9l-8.5 8.5a2.4 2.4 0 0 1-3.4-3.4z"/>'
          + '<path d="M14.7 6.3L17 4a4.5 4.5 0 0 1 3.6 7.9"/>',
  hoadon:   '<path d="M5 3h14v18l-2.3-1.6L14.4 21l-2.4-1.6L9.6 21l-2.3-1.6L5 21z"/>'
          + '<path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  kinhlup:  '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L21 21"/>',
  oto:      '<path d="M5 17h14M4.5 17v-4.2l1.8-4.6A2 2 0 0 1 8.2 7h7.6a2 2 0 0 1 1.9 1.2l1.8 4.6V17"/>'
          + '<path d="M4.5 12.8h15"/><circle cx="7.8" cy="17" r="1.6"/><circle cx="16.2" cy="17" r="1.6"/>',
  tuyen:    '<circle cx="5.5" cy="5.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'
          + '<path d="M5.5 8v4a4 4 0 0 0 4 4h5"/>',
  them:     '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/>'
          + '<circle cx="19" cy="12" r="1.3"/>',
  kenh:     '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/>'
          + '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'
};

/** Trả về một icon SVG. co = cỡ tính bằng px, mặc định theo cỡ chữ. */
function ic(ten, co){
  var d = SVG_ICON[ten];
  if (!d) return '';
  var kt = co ? ' width="' + co + '" height="' + co + '"' : '';
  return '<svg class="ic"' + kt + ' viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + d + '</svg>';
}

/* Emoji cũ nằm rải rác trong mã -> icon tương ứng.
   Emoji nào không có trong bảng thì giữ nguyên (nhãn màu, mặt cười…). */
var EMOJI_ICON = {
  '◔':'pie', '📈':'chart', '📊':'chart', '▦':'cot', '≡':'danhsach', '☰':'gantt',
  '📅':'lich', '🔁':'lap', '💬':'chat', '🕘':'dongho', '⏱':'dongho', '👥':'nhom',
  '👤':'nguoi', '⚙':'caidat', '⚙️':'caidat', '⏻':'nguon', '🔔':'chuong',
  '🌙':'trang', '☀':'mattroi', '☀️':'mattroi', '🔻':'phieu', '📋':'bang',
  '📌':'ghim', '✅':'tick', '✔':'tick', '⚠':'canhbao', '⚠️':'canhbao',
  '％':'phantram', '%':'phantram', '🎚':'mucdo', '🏢':'toanha', '🏆':'cup',
  '🗂':'thumuc', '🔥':'lua', '🛡':'khien', '🔑':'chiakhoa', '✨':'saolap',
  '🖼':'anh', '📖':'sach', '✏':'butchi', '✏️':'butchi', '✉':'thu', '✉️':'thu',
  '📄':'tep', '🔗':'lienket', '🔒':'khoa', '🖨':'mayin', '🔊':'kenh', '🌐':'quacau', '🔍':'kinhlup', '🛠':'cole', '🏛':'phonghop', '🔧':'cole', '🧾':'hoadon', '📎':'lienket', '🚗':'oto', '🛣':'tuyen'
};

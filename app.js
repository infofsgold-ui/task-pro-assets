/* ============ TRẠNG THÁI ỨNG DỤNG ============ */
var S = { token:null, me:null, users:[], config:[], tasks:[], subtasks:[], notifications:[], soBinhLuan:{}, rules:[],
          rooms:[], roomId:null, tinChuaDoc:0, chatTimer:null, chatLastId:null, notiTimer:null,
          view:'dashboard', filter:{}, stats:null, statusTab:'' };

var TRANG_THAI = ['Cần làm','Đang làm','Chờ duyệt','Hoàn thành'];
var MAU_TT = {'Cần làm':'#f59e0b','Đang làm':'#3b82f6','Chờ duyệt':'#a855f7','Hoàn thành':'#10b981'};
var MAU_MD = {'Thấp':'#94a3b8','Trung bình':'#f59e0b','Cao':'#f97316','Khẩn cấp':'#ef4444'};

// nhom: gom mục theo nhóm trên sidebar · chinh: 4 mục ưu tiên hiện ở thanh dưới mobile
/* Icon menu vẽ bằng SVG nét để đổi màu được theo chế độ sáng/tối.
   Riêng Tờ trình giữ icon nhiều màu vì cố ý cho nổi giữa danh sách. */
var MENU = [
  {k:'dashboard', i:ic('pie'),      t:'Tổng quan',   nhom:'Theo dõi', chinh:1, tren:1},
  {k:'stats',     i:ic('chart'),    t:'Thống kê',    nhom:'Theo dõi', tren:1},
  {k:'kanban',    i:ic('cot'),      t:'Kanban',      nhom:'Công việc', chinh:1, tren:1},
  {k:'list',      i:ic('danhsach'), t:'Danh sách',   nhom:'Công việc', tren:1},
  {k:'gantt',     i:ic('gantt'),    t:'Sơ đồ Gantt', nhom:'Công việc', tren:1},
  {k:'calendar',  i:ic('lich'),     t:'Lịch trình',  nhom:'Công việc', chinh:1, tren:1},
  {k:'totrinh',   i:iconToTrinh(19), t:'Tờ trình', nhom:'Công việc'},
  {k:'recurring', i:ic('lap'),      t:'Việc lặp',    nhom:'Công việc'},
  {k:'xe',        i:ic('oto'),      t:'Đăng ký xe',  nhom:'Công việc'},
  {k:'phong',     i:ic('phonghop'), t:'Phòng họp',   nhom:'Công việc'},
  {k:'chat',      i:ic('chat'),     t:'Tin nhắn',    nhom:'Trao đổi', chinh:1},
  {k:'history',   i:ic('dongho'),   t:'Lịch sử',     nhom:'Khác'},
  {k:'users',     i:ic('nhom'),     t:'Người dùng',  nhom:'Khác'},
  {k:'settings',  i:ic('caidat'),   t:'Cài đặt',     nhom:'Khác'}
];

/* ============ CẦU NỐI GỌI SERVER ============ */
function call(fn, args, cb) {
  showLoading(true);
  var runner = google.script.run
    .withSuccessHandler(function(r){ showLoading(false); cb && cb(r); })
    .withFailureHandler(function(e){
      showLoading(false);
      if (String(e.message||e).indexOf('SESSION_EXPIRED') >= 0) { doLogout(); toast('Phiên hết hạn, đăng nhập lại'); }
      else toast('Lỗi: ' + (e.message||e));
    });
  runner[fn].apply(runner, args||[]);
}

/** Gọi máy chủ ngầm: KHÔNG hiện vòng tròn chờ.
 *  Dùng cho thao tác mà người dùng đã thấy kết quả ngay trên màn hình
 *  (kéo thả Kanban, đổi trạng thái ở Danh sách) — lưu chạy phía sau.
 *  Lỗi trả về cho cb dưới dạng {ok:false,msg} để nơi gọi tự xử lý,
 *  ví dụ trả thẻ về cột cũ, thay vì chỉ hiện toast chung. */
function callNgam(fn, args, cb) {
  var runner = google.script.run
    .withSuccessHandler(function(r){ cb && cb(r); })
    .withFailureHandler(function(e){
      var m = String((e && e.message) || e);
      if (m.indexOf('SESSION_EXPIRED') >= 0) { doLogout(); toast('Phiên hết hạn, đăng nhập lại'); return; }
      cb && cb({ ok:false, msg:'Lỗi: ' + m });
    });
  runner[fn].apply(runner, args||[]);
}

/* ============ ĐĂNG NHẬP ============ */
function doLogin(ev){
  ev.preventDefault();
  var u = document.getElementById('lgUser').value.trim();
  var p = document.getElementById('lgPass').value;
  call('apiLogin', [u,p], function(r){
    if (!r.ok) { document.getElementById('lgErr').textContent = r.msg; return; }
    S.token = r.token;
    try { localStorage.setItem('tp_token', r.token); } catch(e){}
    boot();
  });
}
function doLogout(){
  // Thu hồi blob của các tệp đã xem để trả bộ nhớ
  try { Object.keys(S.tepCache || {}).forEach(function(k){ URL.revokeObjectURL(S.tepCache[k].url); }); } catch(e){}
  S.tepCache = {};
S.formDangMo = null;
S.xemQuayLai = null;
  if (S.token) google.script.run.apiLogout(S.token);
  try { localStorage.removeItem('tp_token'); } catch(e){}
  S.token = null;
  if (S.notiTimer) { clearInterval(S.notiTimer); S.notiTimer = null; }
  if (S.chatTimer) { clearInterval(S.chatTimer); S.chatTimer = null; }
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function boot(){
  call('apiBootstrap', [S.token], function(r){
    if (!r || !r.ok) { doLogout(); return; }
    S.me = r.me; S.users = r.users; S.config = r.config;
    S.tasks = r.tasks; S.subtasks = r.subtasks; S.notifications = r.notifications;
    S.soBinhLuan = r.soBinhLuan || {}; S.tinChuaDoc = r.tinChuaDoc || 0;
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    theoDoiKhoManHinh();
    renderShell();
    setView(S.view);
    veNutLoc();
    theoDoiThongBao();
  });
}

/* ============ KHUNG GIAO DIỆN ============ */
/** Những mục người này được vào */
function menuCuaToi(){
  return MENU.filter(function(m){
    // Kiểm soát/Audit vào được để tra cứu danh sách tài khoản và nhật ký quyền
    if (m.k === 'users')     return ['Admin','Manage','Kiểm soát'].indexOf(S.me.VaiTro) >= 0;
    if (m.k === 'recurring') return !chiDoc();
    if (m.k === 'chat')      return !chiXem();
    return true;   // Cài đặt mở cho mọi người - ai cũng cần đổi mật khẩu
  });
}

function huyHieuMenu(m){
  return (m.k === 'chat' && S.tinChuaDoc)
    ? '<span class="nav-badge">' + (S.tinChuaDoc > 99 ? '99+' : S.tinChuaDoc) + '</span>' : '';
}

function nutMenu(m){
  // Thanh đáy trên điện thoại chỉ hiện biểu tượng, nên tên phải nằm ở
  // aria-label và title, nếu không người dùng trình đọc màn hình sẽ nghe
  // một dãy nút không tên.
  return '<button class="nav-item' + (S.view === m.k ? ' active' : '') + '"'
    + ' data-ten="' + esc(m.t) + '" title="' + esc(m.t) + '" aria-label="' + esc(m.t) + '"'
    + (S.view === m.k ? ' aria-current="page"' : '')
    + ' onclick="setView(\'' + m.k + '\')"><i>' + m.i + '</i><span>' + esc(m.t) + '</span>'
    + huyHieuMenu(m) + '</button>';
}

/** Nút trên thanh điều hướng viên ở đầu trang */
function nutVien(m){
  return '<button class="' + (S.view === m.k ? 'active' : '') + '"'
    + ' onclick="setView(\'' + m.k + '\')">' + esc(m.t) + '</button>';
}

/** Đổi emoji đứng đầu tiêu đề thành icon SVG nét đơn sắc.
 *  Emoji là glyph nhiều màu, trình duyệt khoá màu sẵn nên không đổi được
 *  theo chế độ tối; SVG lấy màu từ currentColor thì đổi được.
 *  Emoji nào không có trong bảng EMOJI_ICON thì để nguyên.
 *  Chạy lại nhiều lần được: chỗ nào thay rồi thì bỏ qua. */
var RE_ICON_DAU = /^\s*((?:[\u2000-\u3300]|[\uD83C-\uDBFF][\uDC00-\uDFFF])\uFE0F?)\s*/;
function donIcon(goc){
  if (!goc) return;
  var ds = goc.querySelectorAll('h3, .f-label, .kfoot-td');
  for (var i = 0; i < ds.length; i++){
    var e = ds[i], n = e.firstChild;
    if (!n || n.nodeType !== 3) continue;          // đã thay rồi, hoặc mở đầu bằng thẻ
    var m = RE_ICON_DAU.exec(n.nodeValue);
    if (!m) continue;
    var ten = EMOJI_ICON[m[1]] || EMOJI_ICON[m[1].replace('\uFE0F','')];
    if (!ten) continue;
    n.nodeValue = n.nodeValue.slice(m[0].length);
    var b = document.createElement('i');
    b.className = 'ico ico-2';
    b.innerHTML = ic(ten);

    // Gói icon CÙNG phần chữ vào một bọc. Nhiều tiêu đề dùng
    // justify-content:space-between với một cụm nút ở bên phải; nếu để icon
    // đứng riêng thì tiêu đề thành ba khối và chữ bị đẩy ra giữa.
    var boc = document.createElement('span');
    boc.className = 'h-td';
    e.insertBefore(boc, n);
    boc.appendChild(b);
    while (boc.nextSibling && boc.nextSibling.nodeType === 3) {
      boc.appendChild(boc.nextSibling);
    }
  }
}

function renderShell(){
  var ds = menuCuaToi();

  // Icon cố định trên khung: menu, chuông, bộ lọc, đăng xuất, nút tạo mới
  var dat = function(id, html){ var e = document.getElementById(id); if (e) e.innerHTML = html; };
  dat('logoDau',   '<i class="ico">' + ic('tick', 20) + '</i>');
  dat('btnMenu',   '<i class="ico">' + ic('menu', 18) + '</i>');
  dat('icoChuong', '<i class="ico">' + ic('chuong', 18) + '</i>');
  dat('icoTaoCV',  '<i class="ico ico-2">' + ic('tick', 15) + '</i>');
  dat('icoThoat',  ic('nguon'));
  dat('icoTaoXe',  '<i class="ico ico-2">' + ic('oto', 15) + '</i>');
  dat('icoTaoPhong', '<i class="ico ico-2">' + ic('phonghop', 15) + '</i>');
  veIconTheme();
  var lb = document.getElementById('lbLoc');
  if (lb && !lb.querySelector('svg'))
    lb.innerHTML = '<i class="ico ico-2">' + ic('phieu', 14) + '</i> Bộ lọc:';


  // Theo mẫu Taskly: các mục xem việc nằm trên thanh viên ở đầu trang,
  // các phần hành và quản trị nằm ở dải biểu tượng bên trái.
  var tren = ds.filter(function(m){ return m.tren; });
  var ben  = ds.filter(function(m){ return !m.tren; });
  var oVien = document.getElementById('navVien');
  if (oVien) oVien.innerHTML = tren.map(nutVien).join('');
  var web = ben.map(nutMenu).join('');

  // Mobile: chỉ 4 mục chính ở thanh dưới, phần còn lại nằm trong nút Thêm
  var chinh = ds.filter(function(m){ return m.chinh; });
  var conLai = ds.filter(function(m){ return !m.chinh; });
  var themBg = conLai.some(function(m){ return S.view === m.k; }) ? ' active' : '';
  var mob = chinh.map(nutMenu).join('')
    + '<button class="nav-item' + themBg + '" title="Thêm" aria-label="Thêm"'
    + ' onclick="moThemMenu()"><i>' + ic('them') + '</i><span>Thêm</span></button>';

  document.getElementById('nav').innerHTML =
      '<div class="nav-web">' + web + '</div><div class="nav-mob">' + mob + '</div>';

  var icoTT = document.getElementById('icoTaoTT');
  if (icoTT) icoTT.innerHTML = iconToTrinh(16);
  var anh = S.me.AnhDaiDien;
  document.getElementById('meChip').innerHTML =
      '<span class="anh" style="' + (anh ? 'background-image:url(' + esc(anh) + ')'
        : 'background:' + esc(S.me.MauAvatar || '#6BBE48')) + '">'
    + (anh ? '' : esc(String(S.me.Ten || '?').charAt(0).toUpperCase())) + '</span>'
    + '<span class="tt"><b>' + esc(S.me.Ten) + '</b><small>'
    + esc(S.me.Email || S.me.VaiTro) + '</small></span>';
  document.getElementById('meCard').innerHTML =
      avatarHtml(S.me.Ten, 'lg')
    + '<div class="me-tt"><b>' + esc(S.me.Ten) + '</b>'
    + '<small>' + esc(S.me.Email || S.me.BoPhan || S.me.VaiTro) + '</small></div>'
    + '<button class="icon-btn sm" title="Đăng xuất" onclick="doLogout()">⏻</button>';

  fillSelect('fPhuTrach','Tất cả phụ trách', S.users.map(function(u){return u.Ten;}));
  var oMau = document.getElementById('fMau');
  oMau.innerHTML = '<option value="">Tất cả màu nhãn</option>'
    + MAU_NHAN.map(function(m){
        return '<option value="'+m.ma+'">● '+esc(m.ten)+'</option>'; }).join('');
  var oMD = document.getElementById('fMucDo');
  oMD.innerHTML = '<option value="">Tất cả mức độ</option>'
    + cfgList('MucDo').map(function(x){ return '<option value="'+esc(x)+'">'+coMucDo(x)+'</option>'; }).join('');
  fillSelect('fBoPhan','Tất cả bộ phận', cfgList('BoPhan'));
  renderBadge();
}

function fillSelect(id, all, list){
  var el = document.getElementById(id); if(!el) return;
  el.innerHTML = '<option value="">'+all+'</option>' +
    list.filter(function(v,i,a){return v && a.indexOf(v)===i;})
        .map(function(v){return '<option>'+esc(v)+'</option>';}).join('');
}
function cfgList(nhom){ return S.config.filter(function(c){return c.nhom===nhom;}).map(function(c){return c.giaTri;}); }

function setView(v){
  if (S.chatTimer) { clearInterval(S.chatTimer); S.chatTimer = null; }   // rời tab thì ngừng hỏi server
  if (v !== 'chat') S.roomId = null;
  S.view = v;
  document.querySelectorAll('.nav-item').forEach(function(b,i){});
  renderShell();
  render();
}

/* ============ BỘ LỌC ============ */
/* ============ ĐIỆN THOẠI HAY MÁY TÍNH ============
 * Quyết định ở trình duyệt theo bề ngang màn hình, KHÔNG đoán thiết bị ở máy
 * chủ: đoán theo User-Agent hay sai, không đổi được khi xoay máy hay thu nhỏ
 * cửa sổ, và Apps Script có đệm HTML nên dễ trả nhầm bản.
 * Ai muốn vẫn ép được bản máy tính, lựa chọn đó nhớ trong máy người dùng. */

var NGUONG_DT = 768;        // khớp với @media(max-width:768px) trong Styles

function epBanMayTinh(){
  try { return localStorage.getItem('tp_banmaytinh') === '1'; } catch(e){ return false; }
}

/** Đang hiển thị theo lối điện thoại hay không */
function laDienThoai(){
  if (epBanMayTinh()) return false;
  return window.matchMedia('(max-width:' + NGUONG_DT + 'px)').matches;
}

function datBanMayTinh(b){
  try {
    if (b) localStorage.setItem('tp_banmaytinh','1');
    else   localStorage.removeItem('tp_banmaytinh');
  } catch(e){}
  document.body.classList.toggle('ep-maytinh', !!b);
  _dtTruoc = laDienThoai();
  renderShell(); render();
}

var _dtTruoc = null;

/** Vẽ lại khi màn hình vượt qua ngưỡng, chứ không vẽ lại ở mọi lần resize.
 *  Bàn phím ảo làm đổi chiều cao chứ không đổi bề ngang nên không kích hoạt. */
function theoDoiKhoManHinh(){
  _dtTruoc = laDienThoai();
  document.body.classList.toggle('ep-maytinh', epBanMayTinh());
  window.addEventListener('resize', function(){
    var bay = laDienThoai();
    if (bay === _dtTruoc) return;
    _dtTruoc = bay;
    dongBoLoc();
    renderShell(); render();
  });
}

/* ============ BỘ LỌC DẠNG NGĂN TRƯỢT TRÊN ĐIỆN THOẠI ============
 * Dùng lại ĐÚNG các ô select cũ, chỉ đổi cách bày, nên toàn bộ phần đọc
 * bộ lọc (onFilterChange, filtered) không phải sửa một dòng nào. */

function moBoLoc(){
  document.getElementById('boLoc').classList.add('mo');
  document.getElementById('locNen').classList.remove('hidden');
}
function dongBoLoc(){
  var b = document.getElementById('boLoc'), n = document.getElementById('locNen');
  if (b) b.classList.remove('mo');
  if (n) n.classList.add('hidden');
}

/** Đếm số điều kiện đang bật, để hiện lên nút */
function soBoLocDangBat(){
  var f = S.filter || {}, n = 0;
  if (f.phuTrach) n++;
  if (f.mau) n++;
  if (f.phamVi) n++;
  if (f.mucDo) n++;
  if (f.boPhan) n++;
  if (f.thoiGian && f.thoiGian !== 'all') n++;
  if (f.cuaToi) n++;
  if (f.timKiem) n++;
  return n;
}

function veNutLoc(){
  var b = document.getElementById('btnLoc');
  if (!b) return;
  var n = soBoLocDangBat();
  b.innerHTML = '<i class="ico ico-2">' + ic('phieu',15) + '</i> Bộ lọc'
    + (n ? '<span class="loc-dem">' + n + '</span>' : '');
}

function xoaBoLoc(){
  document.getElementById('search').value = '';
  ['fPhuTrach','fMau','fPhamVi','fMucDo','fBoPhan'].forEach(function(id){
    var e = document.getElementById(id); if (e) e.value = '';
  });
  var tg = document.getElementById('fThoiGian'); if (tg) tg.value = 'all';
  var ct = document.getElementById('fCuaToi');   if (ct) ct.checked = false;
  onFilterChange();
}

function onFilterChange(){
  S.filter = {
    timKiem:  document.getElementById('search').value.trim(),
    phuTrach: document.getElementById('fPhuTrach').value,
    mau:      document.getElementById('fMau').value,
    phamVi:   document.getElementById('fPhamVi').value,
    mucDo:    document.getElementById('fMucDo').value,
    boPhan:   document.getElementById('fBoPhan').value,
    thoiGian: document.getElementById('fThoiGian').value,
    cuaToi:   document.getElementById('fCuaToi').checked
  };
  veNutLoc();
  render();
}

/** Danh sách sau bộ lọc.
 *  boQuaTrangThai = true thì bỏ qua tab trạng thái đang chọn - dùng cho KPI,
 *  vì KPI cần cả việc xong lẫn việc chưa xong mới ra tỷ lệ đúng. */
function filtered(boQuaTrangThai){
  var f = S.filter, r = dateRange(f.thoiGian);
  return S.tasks.filter(function(t){
    if (f.phuTrach && t.PhuTrach !== f.phuTrach) return false;
    if (f.mau && t.MauNhan !== f.mau) return false;
    if (f.phamVi && (t.PhamVi || 'Chung') !== f.phamVi) return false;
    if (f.mucDo && t.MucDo !== f.mucDo) return false;
    if (f.boPhan && t.BoPhan !== f.boPhan) return false;
    if (!boQuaTrangThai && S.statusTab && t.TrangThai !== S.statusTab) return false;
    if (f.cuaToi && !lienQuanToiToi(t)) return false;
    if (f.timKiem && (t.TenCongViec+' '+t.MoTa).toLowerCase().indexOf(f.timKiem.toLowerCase()) < 0) return false;
    if (f.thoiGian === 'overdue') return isOverdue(t);
    if (r) { if ((t.HanChot||'') < r[0] || (t.NgayBatDau||'') > r[1]) return false; }
    return true;
  });
}

function dateRange(k){
  var d = new Date(), y = d.getFullYear(), m = d.getMonth();
  function s(x){ return lymd(x); }
  function add(n){ return s(new Date(d.getTime()+n*86400000)); }
  var dow = (d.getDay()+6)%7; // thứ 2 = 0
  switch(k){
    case 'today':     return [s(d), s(d)];
    case 'week':      return [add(-dow), add(6-dow)];
    case 'lastweek':  return [add(-dow-7), add(-dow-1)];
    case 'month':     return [s(new Date(y,m,1)), s(new Date(y,m+1,0))];
    case 'lastmonth': return [s(new Date(y,m-1,1)), s(new Date(y,m,0))];
    case 'next7':     return [s(d), add(7)];
    case 'next30':    return [s(d), add(30)];
    default: return null;
  }
}

/* ============ QUYỀN (soi gương can_() ở Auth.gs, chỉ để hiển thị) ============ */
function boPhanCuaNguoi(ten){
  var u = S.users.filter(function(x){ return x.Ten === ten; })[0];
  return u ? u.BoPhan : '';
}
function laViecCuaMinh(t){ return t.PhuTrach === S.me.Ten || t.NguoiGiao === S.me.Ten; }

function chiXem(){ return S.me.PhanQuyen === 'Chỉ xem' || S.me.VaiTro === 'View'; }
/** Vai trò chỉ đọc dữ liệu nghiệp vụ: Người xem và Kiểm soát/Audit.
 *  Soi gương vaiTroChiDoc_() ở Auth.gs - dùng để ẩn các nút tạo mới,
 *  tránh bày ra nút bấm vào là server từ chối. */
function chiDoc(){ return chiXem() || S.me.VaiTro === 'Kiểm soát'; }

/** Được đổi trạng thái công việc này không?
 *  Soi gương can_('updateStatus') ở Auth.gs. */
function coTheDoiTT(t){
  if (chiXem()) return false;

  // Việc đã đóng: chỉ người bấm Hoàn thành mở lại được
  if (t.TrangThai === 'Hoàn thành'){
    if (S.me.VaiTro === 'Admin') return true;
    return (t.NguoiHoanThanh || '') === S.me.Ten;
  }

  if (S.me.VaiTro === 'Admin') return true;
  return t.PhuTrach === S.me.Ten;              // CHỈ người đang giữ
}

/** Được sửa hoặc xoá công việc này không?
 *  Soi gương can_('edit') ở Auth.gs: chỉ người ĐANG GIỮ, việc chưa Hoàn thành. */
function coTheSua(t){
  if (chiXem()) return false;
  if (S.me.VaiTro === 'Admin') return true;
  if (t.TrangThai === 'Hoàn thành') return false;
  if (t.PhuTrach !== S.me.Ten) return false;
  if (S.me.VaiTro === 'Manage'){
    var giao = S.users.filter(function(u){ return u.Ten === t.NguoiGiao; })[0];
    return !(giao && giao.VaiTro === 'Admin' && giao.Ten !== S.me.Ten);
  }
  return true;
}

/** Vì sao không sửa được - giải thích thay vì im lặng khoá */
function lyDoKhoaSua(t){
  if (chiXem()) return 'Tài khoản chỉ xem.';
  if (t.TrangThai === 'Hoàn thành'){
    var ai = t.NguoiHoanThanh;
    return 'Việc đã <b>Hoàn thành</b>' + (ai ? ' do <b>' + esc(ai) + '</b> đóng' : '')
         + '. Chỉ người đó mở lại được.';
  }
  if (t.PhuTrach !== S.me.Ten)
    return 'Việc đang ở chỗ <b>' + esc(t.PhuTrach) + '</b>'
         + (t.NguoiGiao === S.me.Ten ? ' — bạn đã chuyển đi nên chỉ còn trao đổi qua bình luận.'
                                     : ' nên chỉ người đó thao tác được. Bạn trao đổi qua bình luận.');
  return 'Việc do Admin giao, bạn không sửa được nội dung.';
}

/** Những vai trò mà mình được phép tạo ra (soi gương vaiTroTaoDuoc_ ở Auth.gs) */
function vaiTroTaoDuoc(){
  if (chiXem()) return [];
  if (S.me.VaiTro === 'Admin'){
    return ['Lãnh đạo','Manage','Hành chính','Kiểm soát','User','View'];
  }
  if (S.me.VaiTro === 'Manage') return ['User','View'];
  return [];
}
function coTheSuaUser(u){
  if (chiXem()) return false;
  if (S.me.VaiTro === 'Admin') return true;
  if (S.me.VaiTro !== 'Manage') return false;
  return ['User','View'].indexOf(u.VaiTro) >= 0 && u.BoPhan === S.me.BoPhan;
}

/** Việc này có liên quan tới mình không (tạo, phụ trách, hoặc từng tham gia)? */
function lienQuanToiToi(t){
  if (laViecCuaMinh(t)) return true;
  return String(t.NguoiThamGia||'').split(',')
    .map(function(x){return x.trim();}).indexOf(S.me.Ten) >= 0;
}
function dsThamGia(t){
  return String(t.NguoiThamGia||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
}

/* ============ TIỆN ÍCH ============ */
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function lymd(d){ var m=d.getMonth()+1, dd=d.getDate();
  return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(dd<10?'0':'')+dd; }
function today(){ return lymd(new Date()); }
function isOverdue(t){ return t.TrangThai!=='Hoàn thành' && t.HanChot && t.HanChot < today(); }
function dmy(s){ if(!s) return ''; var p=String(s).slice(0,10).split('-'); return p[2]+'/'+p[1]; }
function userColor(ten){ var u = S.users.filter(function(x){return x.Ten===ten;})[0]; return (u && u.MauAvatar) || '#64748b'; }
function userAnh(ten){ var u = S.users.filter(function(x){return x.Ten===ten;})[0]; return (u && u.AnhDaiDien) || ''; }

/* Chấm màu đứng trước mức độ ưu tiên, thấy ngay mức nào mà không cần đọc chữ */
var CO_MD = {'Thấp':'🟢', 'Trung bình':'🟡', 'Cao':'🟠', 'Khẩn cấp':'🔴'};
function coMucDo(md){ return (CO_MD[md] || '⚪') + ' ' + md; }

/* Bảng màu nhãn dùng chung cho công việc và tờ trình */
var MAU_NHAN = [
  {ma:'#ef4444', ten:'Đỏ'},     {ma:'#f97316', ten:'Cam'},
  {ma:'#f59e0b', ten:'Vàng'},   {ma:'#10b981', ten:'Xanh lá'},
  {ma:'#06b6d4', ten:'Xanh ngọc'}, {ma:'#3b82f6', ten:'Xanh dương'},
  {ma:'#8b5cf6', ten:'Tím'},    {ma:'#ec4899', ten:'Hồng'},
  {ma:'#64748b', ten:'Xám'}
];
function tenMau(ma){
  var m = MAU_NHAN.filter(function(x){ return x.ma === ma; })[0];
  return m ? m.ten : '';
}

/** Icon tờ trình: trang giấy có con dấu đỏ.
 *  Vẽ riêng thay cho 📄 vì emoji tài liệu quá giống nhau, người dùng
 *  khó nhặt ra giữa các mục khác; con dấu đỏ thì nhìn phát ra ngay. */
function iconToTrinh(co){
  co = co || 18;
  // Con dấu cố ý tràn ra ngoài mép giấy: phá bóng ngoài của hình chữ nhật
  // nên ở cỡ 18px vẫn nhặt ra ngay giữa các mục khác trong menu.
  return '<svg class="ico-tt" width="' + co + '" height="' + co + '" viewBox="0 0 24 24"'
    + ' aria-hidden="true">'
    + '<path d="M4 2.6h8.4L17.4 7.6v13.8H4z" fill="#fcd77f"/>'
    + '<path d="M4 2.6h8.4L17.4 7.6v13.8H4z" fill="none" stroke="#8a6b1f" stroke-width="1.4"'
    +   ' stroke-linejoin="round" opacity=".7"/>'
    + '<path d="M12.4 2.6v5h5" fill="#f0c25c" stroke="#8a6b1f" stroke-width="1.4"'
    +   ' stroke-linejoin="round" opacity=".85"/>'
    + '<path d="M6.7 11.2h7M6.7 14.2h4.6" stroke="#8a6b1f" stroke-width="1.5"'
    +   ' stroke-linecap="round" opacity=".65"/>'
    + '<circle cx="17.6" cy="17.4" r="5.4" fill="#e5484d"/>'
    + '<circle cx="17.6" cy="17.4" r="3.1" fill="none" stroke="#fff" stroke-width="1.3"/>'
    + '</svg>';
}

/** Icon chiếc ô, tô theo màu nhãn. Vẽ bằng SVG để đổi màu được,
 *  emoji ☂ thì trình duyệt khoá màu sẵn không đổi được. */
function iconO(mau, co){
  co = co || 16;
  return '<svg class="ico-o" width="' + co + '" height="' + co + '" viewBox="0 0 24 24"'
    + ' style="color:' + esc(mau || 'currentColor') + '" aria-hidden="true">'
    + '<path fill="currentColor" d="M2.4 12.4a9.6 9.6 0 0 1 19.2 0 .55.55 0 0 1-.83.5c-1.4-.83-2.6-.83-4 0'
    +   'a.6.6 0 0 1-.62 0c-1.4-.83-2.6-.83-4 0a.6.6 0 0 1-.62 0c-1.4-.83-2.6-.83-4 0'
    +   'a.6.6 0 0 1-.62 0c-1.4-.83-2.6-.83-4 0a.55.55 0 0 1-.83-.5Z"/>'
    + '<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"'
    +   ' d="M12 1.6v1.3M12 13v5.6a2.1 2.1 0 0 0 4.2 0"/>'
    + '</svg>';
}

function chamMau(ma){
  return ma ? '<span class="nhan-o" title="Nhãn ' + esc(tenMau(ma)) + '">' + iconO(ma, 14) + '</span>' : '';
}
function avatarHtml(ten, cls){
  var anh = userAnh(ten);
  if (anh) {
    return '<span class="avatar anh '+(cls||'')+'" title="'+esc(ten||'')+'"'
         + ' style="background-image:url('+anh+')"></span>';
  }
  return '<span class="avatar '+(cls||'')+'" style="background:'+userColor(ten)+'">'
       + esc(String(ten||'?').charAt(0).toUpperCase())+'</span>';
}
function chip(txt, color){ return '<span class="chip" style="background:'+color+'22;color:'+color+'">'+esc(txt)+'</span>'; }
function subOf(id){ return S.subtasks.filter(function(s){return String(s.TaskID)===String(id);}); }

function toast(msg){
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(el._t); el._t = setTimeout(function(){ el.classList.add('hidden'); }, 2600);
}
function showLoading(b){ document.getElementById('loading').classList.toggle('hidden', !b); }
function closeModal(){
  S.formDangMo = null;
  document.getElementById('modal').classList.add('hidden');
}
/** kieu = 'ngan' thì mở dạng ngăn trượt từ phải (dùng cho form công việc),
 *  bỏ trống thì là hộp thoại giữa màn hình như cũ. */
function openModal(html, kieu){
  var m = document.getElementById('modal');
  document.getElementById('modalBody').innerHTML = html;
  donIcon(document.getElementById('modalBody'));
  m.classList.toggle('ngan', kieu === 'ngan');
  m.classList.remove('hidden');
}
/** Bảng chọn các mục còn lại trên mobile */
function moThemMenu(){
  var conLai = menuCuaToi().filter(function(m){ return !m.chinh; });
  openModal('<h3>Tất cả mục</h3>'
    + '<div class="menu-luoi">' + conLai.map(function(m){
        return '<button class="menu-o' + (S.view === m.k ? ' active' : '') + '"'
          + ' onclick="closeModal();setView(\'' + m.k + '\')"><i>' + m.i + '</i>'
          + esc(m.t) + huyHieuMenu(m) + '</button>';
      }).join('') + '</div>'
    + '<div id="bangMau"></div>'
    + '<label class="chk-loc" style="margin-top:14px">'
    +   '<input type="checkbox" id="chkMayTinh"' + (epBanMayTinh() ? ' checked' : '')
    +   ' onchange="closeModal();datBanMayTinh(this.checked)"> Xem bản máy tính</label>'
    + '<p class="small muted" style="margin-top:4px">Bật để dùng giao diện như trên máy tính: '
    + 'bảng đầy đủ, Kanban 4 cột. Máy này sẽ nhớ lựa chọn.</p>'
    + '<div class="modal-foot"><button class="btn" onclick="closeModal()">Đóng</button>'
    + '<button class="btn danger" onclick="doLogout()">Đăng xuất</button></div>');
  veBangMau();
}

function toggleTaoMoi(e){
  e.stopPropagation();
  document.getElementById('menuTaoMoi').classList.toggle('hidden');
}
function closeTaoMoi(){ document.getElementById('menuTaoMoi').classList.add('hidden'); }
document.addEventListener('click', function(){ 
  var m = document.getElementById('menuTaoMoi');
  if (m) m.classList.add('hidden');
});

/* ---------- Vệt sáng bám con trỏ ----------
 * Một trình xử lý duy nhất cho cả trang, gom vào khung hình bằng
 * requestAnimationFrame để không tính lại nhiều lần mỗi giây. */
(function(){
  var O_SANG = '.card,.kcard,.kcol,.opt,.me-card,.menu-o,.room';
  var cho = null;

  function ve(){
    var d = cho; cho = null;
    if (!d) return;
    var o = d.o.getBoundingClientRect();
    d.o.style.setProperty('--mx', Math.round(d.x - o.left) + 'px');
    d.o.style.setProperty('--my', Math.round(d.y - o.top) + 'px');
  }

  document.addEventListener('pointermove', function(e){
    if (e.pointerType === 'touch') return;         // chạm thì không cần vệt sáng
    var o = e.target.closest && e.target.closest(O_SANG);
    if (!o) return;
    var moi = !cho;
    cho = { o: o, x: e.clientX, y: e.clientY };
    if (moi) requestAnimationFrame(ve);
  }, { passive: true });
})();

function toggleSidebar(){ document.querySelector('.sidebar').classList.toggle('hidden'); }

/** Vẽ icon cho nút đổi sáng/tối theo chế độ đang bật.
 *  Tách riêng để lúc mới vào app cũng gọi được, không chỉ khi bấm. */
/* ============ HIỆU ỨNG CHO GIAO DIỆN NHIỀU SỐ LIỆU ============
 * Chỉ dùng để dẫn mắt tới con số, không trang trí. Tất cả đều tắt
 * khi máy người dùng bật "giảm chuyển động".
 * ------------------------------------------------------------- */

function giamChuyenDong(){
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch(e){ return false; }
}

/** Khung chờ nhấp nháy, thay cho dòng chữ "Đang tải..." */
function khungCho(soDong, coDauDe){
  var d = [];
  if (coDauDe) d.push('<div class="kc-d w35"></div>');
  for (var i = 0; i < (soDong || 3); i++){
    d.push('<div class="kc-d cao' + (i % 3 === 2 ? ' w70' : '') + '"></div>');
  }
  return '<div class="kc" aria-busy="true" aria-label="Đang tải dữ liệu">' + d.join('') + '</div>';
}

/** Chạy số từ 0 lên giá trị thật. Dùng cho các ô đã đánh dấu data-dem. */
function demSoLen(goc){
  var ds = (goc || document).querySelectorAll('[data-dem]');
  if (!ds.length) return;

  if (giamChuyenDong()){
    for (var j = 0; j < ds.length; j++) ds[j].removeAttribute('data-dem');
    return;
  }
  Array.prototype.forEach.call(ds, function(e){
    var den = parseFloat(e.getAttribute('data-dem'));
    var hau = e.getAttribute('data-hau') || '';
    e.removeAttribute('data-dem');
    if (!isFinite(den)) return;
    var leThap = (String(den).split('.')[1] || '').length;
    var t0 = 0, THOI = 760;
    function buoc(t){
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / THOI);
      var muot = 1 - Math.pow(1 - p, 3);          // chậm dần về cuối
      e.textContent = (den * muot).toFixed(leThap) + hau;
      if (p < 1) requestAnimationFrame(buoc);
      else e.textContent = den.toFixed(leThap) + hau;
    }
    requestAnimationFrame(buoc);
  });
}

/* ============ MÀU ĐỔI THEO GIỜ TRONG NGÀY ============
 * Sáng thì nền sáng, càng về đêm càng tối dần. Sáu khoảng giờ, mỗi khoảng
 * một bảng màu riêng trong Styles.html; ở đây chỉ lo chọn đúng khoảng và
 * đổi mượt. Người dùng vẫn ghim được Sáng hoặc Tối nếu muốn.
 * -------------------------------------------------------------------- */

var KHOANG_GIO = [
  { ma:'binh-minh', tu:5,  den:7,  nen:'light', ten:'Bình minh' },
  { ma:'ban-ngay',  tu:7,  den:15, nen:'light', ten:'Ban ngày'  },
  { ma:'xe-chieu',  tu:15, den:18, nen:'light', ten:'Xế chiều'  },
  { ma:'hoang-hon', tu:18, den:20, nen:'dark',  ten:'Hoàng hôn' },
  { ma:'toi',       tu:20, den:23, nen:'dark',  ten:'Tối'       },
  { ma:'dem',       tu:23, den:5,  nen:'dark',  ten:'Đêm'       }
];

/** Khoảng giờ ứng với giờ h (0..23). Khoảng "đêm" vắt qua nửa đêm. */
function khoangTheoGio(h){
  for (var i = 0; i < KHOANG_GIO.length; i++){
    var k = KHOANG_GIO[i];
    if (k.tu < k.den ? (h >= k.tu && h < k.den) : (h >= k.tu || h < k.den)) return k;
  }
  return KHOANG_GIO[1];
}

/** 'auto' theo đồng hồ · 'light' · 'dark' — người dùng ghim thì nhớ trong máy */
function cheDoMau(){
  try { return localStorage.getItem('tp_theme') || 'auto'; } catch(e){ return 'auto'; }
}

function khoangDangDung(){
  var cd = cheDoMau();
  if (cd === 'light') return { ma:'ban-ngay', nen:'light', ten:'Sáng (đã ghim)' };
  if (cd === 'dark')  return { ma:'dem',      nen:'dark',  ten:'Tối (đã ghim)'  };
  return khoangTheoGio(new Date().getHours());
}

/** Đặt lại bảng màu. Không đổi gì thì thôi, để khỏi vẽ lại vô ích. */
function apDungMau(batHieuUng){
  var k = khoangDangDung(), b = document.body;
  if (b.dataset.gio === k.ma && b.dataset.theme === k.nen) return false;

  if (batHieuUng !== false){
    document.documentElement.classList.add('doi-mau');
    clearTimeout(window._hetDoiMau);
    window._hetDoiMau = setTimeout(function(){
      document.documentElement.classList.remove('doi-mau');
    }, 1000);
  }
  b.dataset.theme = k.nen;
  b.dataset.gio   = k.ma;
  veIconTheme();
  return true;
}

/** Soát lại mỗi 5 phút, và soát ngay khi người dùng quay lại tab */
function theoDoiGio(){
  apDungMau(false);
  clearInterval(window._dongHoMau);
  window._dongHoMau = setInterval(function(){
    if (apDungMau(true) && (S.view === 'dashboard' || S.view === 'stats')) render();
  }, 300000);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) apDungMau(true);
  });
}

function veIconTheme(){
  var e = document.getElementById('themeBtn');
  if (!e) return;
  var k = khoangDangDung(), cd = cheDoMau();
  e.innerHTML = '<i class="ico">' + ic(k.nen === 'dark' ? 'mattroi' : 'trang', 18) + '</i>';
  e.title = cd === 'auto'
    ? 'Màu đang theo giờ: ' + k.ten + ' — bấm để ghim nền sáng'
    : (cd === 'light' ? 'Đang ghim nền sáng — bấm để ghim nền tối'
                      : 'Đang ghim nền tối — bấm để quay lại theo giờ');
}

/** Bấm nút trên thanh: xoay vòng Theo giờ → Sáng → Tối → Theo giờ */
function toggleTheme(){
  var cd = cheDoMau();
  datCheDoMau(cd === 'auto' ? 'light' : (cd === 'light' ? 'dark' : 'auto'));
}

function datCheDoMau(cd){
  try {
    if (cd === 'auto') localStorage.removeItem('tp_theme');
    else localStorage.setItem('tp_theme', cd);
  } catch(e){}
  apDungMau(true);
  veIconTheme();
  veBangMau();
  if (S.view === 'dashboard' || S.view === 'stats') render();
}

/** Bảng chọn chế độ màu, đặt trong bảng "Thêm" */
function veBangMau(){
  var o = document.getElementById('bangMau');
  if (!o) return;
  var cd = cheDoMau(), k = khoangDangDung();
  var nut = function(ma, ten){
    return '<button class="' + (cd === ma ? 'chon' : '') + '"'
      + ' onclick="datCheDoMau(\'' + ma + '\')">' + ten + '</button>';
  };
  o.innerHTML = '<div class="mau-chon">'
    + nut('auto', 'Theo giờ') + nut('light', 'Sáng') + nut('dark', 'Tối')
    + '</div><div class="mau-gio">'
    + (cd === 'auto'
        ? 'Bây giờ là <b>' + esc(k.ten) + '</b> — nền sẽ tối dần về đêm.'
        : 'Đang ghim cố định, không đổi theo giờ nữa.')
    + '</div>';
}

/* ============ THÔNG BÁO ============ */
function renderBadge(){
  var n = S.notifications.filter(function(x){return !x.DaDoc;}).length;
  var b = document.getElementById('badge');
  b.textContent = n; b.classList.toggle('hidden', n===0);
}
function toggleNotify(){
  var p = document.getElementById('notifyPanel');
  if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
  veBangThongBao();
  p.classList.remove('hidden');
  // Mở bảng thì hỏi lại server ngay, khỏi phải chờ hết chu kỳ
  lamMoiThongBao();
}

/** Xếp thông báo: CHƯA ĐỌC lên trên, ĐÃ ĐỌC xuống dưới,
 *  trong mỗi nhóm thì mới nhất trước. */
function xepThongBao(){
  return S.notifications.slice().sort(function(a, b){
    if (!a.DaDoc !== !b.DaDoc) return a.DaDoc ? 1 : -1;   // chưa đọc lên trước
    return String(b.ThoiGian).localeCompare(String(a.ThoiGian));
  });
}

/** Vẽ lại ruột bảng thông báo mà không đóng mở lại bảng */
function veBangThongBao(){
  var p = document.getElementById('notifyPanel');
  if (!p) return;
  var ds = xepThongBao();
  var chuaDoc = ds.filter(function(n){ return !n.DaDoc; });
  var daDoc   = ds.filter(function(n){ return n.DaDoc; }).slice(0, 30);

  var mot = function(n){
    // Chỉ cần thông báo có gắn công việc là cho bấm. Danh sách công việc trong
    // bộ nhớ chỉ nạp lúc đăng nhập nên có thể cũ hơn thông báo - lấy nó làm căn
    // cứ ẩn nút thì việc mới giao sẽ không bấm được.
    var moDuoc = !!n.TaskID;
    return '<div class="notify-item' + (n.DaDoc ? '' : ' unread') + (moDuoc ? ' mo-duoc' : '') + '"'
      + (moDuoc ? ' onclick="moTuThongBao(\'' + n.TaskID + '\',\'' + n.ID + '\')"'
                  + ' title="Bấm để mở công việc"' : '')
      + '><b class="small">' + esc(n.Loai) + '</b>'
      + '<div class="small">' + esc(n.NoiDung) + '</div>'
      + '<div class="small muted">' + esc(truocDay(n.ThoiGian))
      + (moDuoc ? ' · <span class="nb-mo">mở công việc →</span>' : '') + '</div></div>';
  };

  p.innerHTML = '<div class="nb-dau">'
    + '<b>Thông báo</b>'
    + (chuaDoc.length ? '<span class="nb-dem">' + chuaDoc.length + ' chưa đọc</span>' : '')
    + '<button class="btn sm" onclick="markAllRead()"' + (chuaDoc.length ? '' : ' disabled')
    + '>Đánh dấu đã đọc</button></div>'
    + (chuaDoc.length
        ? '<div class="nb-nhan">Chưa đọc</div>' + chuaDoc.map(mot).join('')
        : '')
    + (daDoc.length
        ? '<div class="nb-nhan">Đã đọc</div>' + daDoc.map(mot).join('')
        : '')
    + (ds.length ? '' : '<div class="muted small" style="padding:8px">Không có thông báo</div>');
}

/** Bấm vào một thông báo thì mở thẳng việc được nhắc tới. */
function moTuThongBao(taskId, notiId){
  var p = document.getElementById('notifyPanel');
  if (p) p.classList.add('hidden');

  var n = S.notifications.filter(function(x){ return String(x.ID) === String(notiId); })[0];
  if (n && !n.DaDoc){
    n.DaDoc = true; renderBadge();
    call('apiMarkRead', [S.token, notiId], function(){});
  }
  moViecTheoId(taskId, true);
}

/** Mở một công việc theo ID, tự chọn đúng màn hình cho từng loại.
 *  Chưa có trong bộ nhớ thì nạp lại MỘT lần rồi thử lại, thay vì báo lỗi ngay. */
function moViecTheoId(taskId, choPhepNapLai){
  var t = S.tasks.filter(function(x){ return String(x.ID) === String(taskId); })[0];

  if (!t){
    if (!choPhepNapLai){
      toast('Công việc này không còn nữa hoặc bạn không có quyền xem');
      return;
    }
    toast('Đang mở...');
    reload(function(){ moViecTheoId(taskId, false); });
    return;
  }

  if (t.Loai === 'Đăng ký xe'){
    var moXe = function(){ S.view = 'xe'; renderShell(); render(); moPhieuXe(taskId); };
    if (S.xe) moXe();
    else call('apiXeDanhMuc', [S.token], function(r){ S.xe = r; moXe(); });
    return;
  }
  if (t.Loai === 'Đăng ký phòng họp'){
    var moPhong = function(){ S.view = 'phong'; renderShell(); render(); moPhieuPhong(taskId); };
    if (S.ph) moPhong();
    else call('apiPhongDanhMuc', [S.token], function(r){ S.ph = r; moPhong(); });
    return;
  }
  openTaskForm(taskId);
}

/** "3 phút trước", "Hôm qua 14:20" — dễ đọc hơn mốc thời gian thô */
function truocDay(ts){
  var s = String(ts || '').replace(' ', 'T');
  var t = new Date(s).getTime();
  if (!t) return String(ts || '').slice(0, 16);
  var giay = Math.floor((Date.now() - t) / 1000);
  if (giay < 60)    return 'vừa xong';
  if (giay < 3600)  return Math.floor(giay / 60) + ' phút trước';
  if (giay < 86400) return Math.floor(giay / 3600) + ' giờ trước';
  if (giay < 172800) return 'Hôm qua ' + String(ts).slice(11, 16);
  return String(ts).slice(0, 16);
}

function markAllRead(){
  call('apiMarkRead',[S.token,null], function(){
    S.notifications.forEach(function(n){ n.DaDoc = true; });
    renderBadge(); veBangThongBao();
  });
}

/* ---------- Theo dõi thông báo theo chu kỳ ----------
 * Apps Script không có kết nối đẩy, nên phải hỏi lại server.
 * Chỉ hỏi khi tab đang hiển thị, để tab mở nền không đốt hạn mức. */
function lamMoiThongBao(){
  if (!S.token) return;
  google.script.run
    .withSuccessHandler(function(r){
      if (!r || !r.ok) return;
      var truocDo = S.notifications.filter(function(n){ return !n.DaDoc; }).length;
      S.notifications = r.notifications || [];
      S.tinChuaDoc = r.tinChuaDoc || 0;
      renderBadge();
      if (typeof renderShell === 'function') renderShell();
      var p = document.getElementById('notifyPanel');
      if (p && !p.classList.contains('hidden')) veBangThongBao();

      var bayGio = S.notifications.filter(function(n){ return !n.DaDoc; }).length;
      if (bayGio > truocDo){
        toast('Bạn có ' + (bayGio - truocDo) + ' thông báo mới');
        // Thông báo nhắc tới việc chưa có trong bộ nhớ thì kéo luôn về,
        // để bấm vào là mở được ngay chứ không phải chờ nạp lại.
        var thieu = S.notifications.some(function(n){
          return n.TaskID && !S.tasks.some(function(t){ return String(t.ID) === String(n.TaskID); });
        });
        if (thieu) reload();
      }
    })
    .withFailureHandler(function(){ /* mạng chập chờn thì bỏ qua lượt này */ })
    .apiThongBao(S.token);
}

function theoDoiThongBao(){
  if (S.notiTimer) clearInterval(S.notiTimer);
  S.notiTimer = setInterval(function(){
    if (S.token && !document.hidden) lamMoiThongBao();
  }, 45000);
  // Quay lại tab sau một lúc thì cập nhật ngay, khỏi chờ hết chu kỳ
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden && S.token) lamMoiThongBao();
  });
}

/* ============ FORM CÔNG VIỆC ============ */
function openTaskForm(id){
  var t = id ? S.tasks.filter(function(x){return x.ID===id;})[0] : null;
  var subs = id ? subOf(id) : [];
  var canAssign = ['Admin','Manage'].indexOf(S.me.VaiTro) >= 0;
  var suaDuoc   = !t || coTheSua(t);
  var doiTTDuoc = !!t && coTheDoiTT(t);
  var kh  = suaDuoc ? '' : ' disabled';                    // ô nội dung
  var khT = (suaDuoc || doiTTDuoc) ? '' : ' disabled';     // ô trạng thái và tiến độ
  var opt = function(list, val){ return list.map(function(v){
      return '<option'+(v===val?' selected':'')+'>'+esc(v)+'</option>'; }).join(''); };

  openModal(
    '<h3>' + (t ? (laToTrinh(t) ? iconToTrinh(20) + ' Tờ trình ' + esc(t.SoToTrinh) : '✏️ Sửa công việc')
                 : '➕ Tạo công việc mới') + '</h3>'
  + (t && laToTrinh(t) ? khoiToTrinh(t) : '')
  + '<div class="form-grid">'
  + '  <div class="field full"><label>Tên công việc *</label><input id="fTen"'+kh+' value="'+esc(t?t.TenCongViec:'')+'"></div>'
  + '  <div class="field full"><label>' + (t && laToTrinh(t) ? 'Nội dung tờ trình' : 'Mô tả')
  +      '</label><textarea id="fMoTa"'+kh+' rows="' + (t && laToTrinh(t) ? 5 : 2) + '">'+esc(t?t.MoTa:'')+'</textarea></div>'
  + (t && laToTrinh(t)
      ? '  <div class="field full"><label>Kính trình</label><input id="fKinhTrinh"'+kh+' value="'+esc(t.KinhTrinh)+'"></div>'
      + '  <div class="field full"><label>Căn cứ</label><textarea id="fCanCu"'+kh+' rows="3">'+esc(t.CanCu)+'</textarea></div>'
      : '')
  + '  <div class="field"><label>Người phụ trách *</label>'
  +      oChonNguoi('fPT', S.users.map(function(u){return u.Ten;}),
                    t?t.PhuTrach:S.me.Ten, false, !(canAssign&&suaDuoc)) + '</div>'
  + '  <div class="field"><label>Bộ phận</label><select id="fBP"'+kh+'>'+opt([''].concat(cfgList('BoPhan')), t?t.BoPhan:S.me.BoPhan)+'</select></div>'
  + '  <div class="field"><label>Mức độ ưu tiên</label><select id="fMD"'+kh+' class="sel-co">'
  +      ['Thấp','Trung bình','Cao','Khẩn cấp'].map(function(x){
           return '<option value="'+x+'"'+((t?t.MucDo:'Trung bình')===x?' selected':'')+'>'+coMucDo(x)+'</option>';
         }).join('') + '</select></div>'
  + '  <div class="field"><label>Trạng thái</label><select id="fTT"'+khT+'>'+opt(TRANG_THAI, t?t.TrangThai:'Cần làm')+'</select></div>'
  + '  <div class="field"><label>Tần suất</label><select id="fTS"'+kh+'>'+opt(['Hàng ngày','Hàng tuần','Sự vụ'], t?t.TanSuat:'Sự vụ')+'</select></div>'
  + '  <div class="field"><label>Màu nhãn</label>' + oMauNhan(t ? t.MauNhan : '', suaDuoc) + '</div>'
  + '  <div class="field"><label>Lĩnh vực</label><select id="fLV"'+kh+'>'+opt(cfgList('LinhVuc'), t?t.LinhVuc:'Chưa phân loại')+'</select></div>'
  + '  <div class="field"><label>Tiến độ (%)</label><input id="fTD" type="number"'+khT+' min="0" max="100" value="'+(t?t.TienDo:0)+'"></div>'
  + '  <div class="field"><label>Ngày bắt đầu *</label><input id="fBD" type="date"'+kh+' value="'+(t?t.NgayBatDau:today())+'"></div>'
  + '  <div class="field"><label>Hạn chót *</label><input id="fHC" type="date"'+kh+' value="'+(t?t.HanChot:today())+'"></div>'
  + '  <div class="field full"><label>Ai nhìn thấy công việc này</label>' + oPhamVi(t ? t.PhamVi : 'Chung', suaDuoc) + '</div>'
  + '  <div class="field full"><label>Người theo dõi</label>' + oTheoDoi(t ? t.NguoiTheoDoi : '', suaDuoc) + '</div>'
  + (t ? '  <div class="field full"><label class="lb-ai">Đính kèm của công việc'
       + (suaDuoc ? '<button type="button" class="btn sm" onclick="themLink(\'' + t.ID + '\')">' + ic('lienket',13) + ' Thêm link</button>' : '')
       + '</label>'
       + '<input type="file" id="tepTask" multiple accept="application/pdf,image/png,image/jpeg,image/gif,image/webp"'
       + ' style="display:none" onchange="chonTepTask(event,\'' + t.ID + '\')">'
       + (suaDuoc
           ? '<div class="thavao" id="thaVao" onclick="document.getElementById(\'tepTask\').click()"'
             + ' ondragover="keoQua(event,1)" ondragleave="keoQua(event,0)" ondrop="thaTep(event,\'' + t.ID + '\')">'
             + '<div class="thavao-ico">⬆</div>'
             + '<div><b>Bấm để tải lên</b> hoặc kéo thả tệp vào đây</div>'
             + '<small>PDF và ảnh (PNG, JPG, GIF, WEBP) · mỗi tệp dưới 8 MB</small>'
             + '</div>'
           : '')
       + '<div id="tepTaskList" class="tep-list muted small">Đang tải...</div></div>'
       : khoiTepMoi())
  + '  <div class="field full"><label>Công việc con / Ghi chú</label><div id="subWrap"></div>'
  + (suaDuoc ? '     <button class="btn sm" onclick="addSubRow()">+ Thêm mục</button>' : '') + '</div>'
  + '</div>'
  + (t && dsThamGia(t).length > 1 ? khoiChuoi(t) : '')
  + (t ? khoiChuyenTiep(t) : '')
  + (t && !suaDuoc
      ? '<div class="note-quyen">🔒 ' + lyDoKhoaSua(t)
      + (doiTTDuoc ? ' Bạn vẫn đổi được <b>trạng thái</b> và <b>tiến độ</b>.'
                   : ' Bạn vẫn xem và bình luận được.') + '</div>'
      : '')
  + (t ? khoiTraoDoi(t.ID) : '')
  + '<div class="modal-foot">'
  +   (t && suaDuoc ? '<button class="btn danger" onclick="delTask(\''+t.ID+'\')">Xoá</button>' : '')
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   (suaDuoc
        ? '<button class="btn primary" onclick="saveTask('+(t?"'"+t.ID+"'":'null')+')">Lưu</button>'
        : (doiTTDuoc
            ? '<button class="btn primary" onclick="saveTask(\''+(t?t.ID:'')+'\',true)">Lưu trạng thái</button>'
            : ''))
  + '</div>', 'ngan');

  vePick('fPT'); vePick('fTheoDoi');
  subs.forEach(function(s){ addSubRow(s, !suaDuoc); });
  if (!subs.length && suaDuoc) addSubRow();
  S.tepDangChon = [];
  S.tepMoi = [];
  if (!id) veTepMoi();
  S.formDangMo = id || null;      // để khung xem tệp biết đường quay lại
  if (id){ loadComments(id); loadTepTask(id); }
}

/* ---------- Chuỗi liên thông ---------- */
function khoiChuoi(t){
  var ds = dsThamGia(t), xong = t.TrangThai === 'Hoàn thành';
  return '<div class="chuoi"><b class="small">🔗 Quy trình liên thông — ' + ds.length + ' bước</b>'
    + '<div class="chuoi-row">'
    + ds.map(function(ten, i){
        var dangGiu = ten === t.PhuTrach;
        return (i ? '<span class="mui">→</span>' : '')
             + '<span class="mat' + (dangGiu ? ' now' : '') + '">'
             + '<b class="buoc">' + (i + 1) + '</b>' + avatarHtml(ten) + esc(ten)
             + '<i class="small">' + esc(boPhanCuaNguoi(ten) || '') + '</i>'
             + (dangGiu && !xong ? ' <i class="small">· đang giữ</i>' : '') + '</span>';
      }).join('')
    + (xong ? '<span class="mui">→</span><span class="mat het">✅ Kết thúc</span>' : '')
    + '</div></div>';
}

/** Nút chuyển tiếp + lời nhắc theo từng khâu của quy trình */
function khoiChuyenTiep(t){
  if (t.TrangThai === 'Hoàn thành') {
    return '<div class="nhac xong">✅ Công việc đã <b>Hoàn thành</b> — quy trình kết thúc tại đây. '
         + 'Muốn giao tiếp cho người khác thì đổi trạng thái khác trước.</div>';
  }
  // Chuyển tiếp là thao tác của người ĐANG GIỮ, không phải người đã chuyển đi
  if (!coTheDoiTT(t) || (t.PhuTrach !== S.me.Ten && S.me.VaiTro !== 'Admin')) return '';
  var nhac = t.TrangThai === 'Chờ duyệt'
    ? '<div class="nhac">⏳ Đang ở khâu <b>Chờ duyệt</b>. Bạn có thể chuyển tiếp cho người tiếp theo '
      + '(cùng phòng hoặc khác phòng), hoặc đổi trạng thái sang <b>Hoàn thành</b> để kết thúc quy trình.</div>'
    : '';
  return nhac
    + '<div class="modal-foot" style="justify-content:flex-start;margin-top:10px">'
    + '<button class="btn" onclick="openHandoff(\'' + t.ID + '\')">➡️ Chuyển tiếp cho người khác</button>'
    + '</div>';
}

/* ---------- Chuyển tiếp công việc sang phòng ban khác ---------- */
function openHandoff(taskId){
  var t = S.tasks.filter(function(x){ return x.ID === taskId; })[0];
  if (!t) return;
  var nhan = S.users.filter(function(u){
    return u.Ten !== t.PhuTrach && u.VaiTro !== 'View' && u.PhanQuyen !== 'Chỉ xem';
  });
  if (!nhan.length){ toast('Chưa có người nào khác để chuyển tiếp'); return; }

  // Nhóm người nhận theo phòng ban: phòng mình lên trước cho dễ chọn
  var nhom = {};
  nhan.forEach(function(u){
    var bp = u.BoPhan || 'Chưa rõ phòng';
    (nhom[bp] = nhom[bp] || []).push(u);
  });
  var tenNhom = Object.keys(nhom).sort(function(a, b){
    if (a === S.me.BoPhan) return -1;
    if (b === S.me.BoPhan) return 1;
    return a.localeCompare(b);
  });

  openModal('<h3>➡️ Chuyển tiếp công việc — bước ' + (dsThamGia(t).length + 1) + '</h3>'
  + '<p class="muted small">Công việc <b>' + esc(t.TenCongViec) + '</b> vẫn là một, chỉ đổi người đang giữ. '
  + 'Chuyển được cho người <b>cùng phòng hoặc khác phòng</b>, không giới hạn số bước. '
  + 'Quy trình chỉ kết thúc khi có người chuyển sang <b>Hoàn thành</b>.</p>'
  + '<div class="form-grid">'
  + '<div class="field"><label>Đang giữ</label><input value="' + esc(t.PhuTrach)
  +   ' (' + esc(boPhanCuaNguoi(t.PhuTrach) || 'chưa rõ phòng') + ') · ' + esc(t.TrangThai) + '" disabled></div>'
  + '<div class="field"><label>Chuyển cho *</label><select id="hoNhan">'
  +   tenNhom.map(function(bp){
        return '<optgroup label="' + esc(bp) + (bp === S.me.BoPhan ? ' (phòng bạn)' : '') + '">'
             + nhom[bp].map(function(u){
                 return '<option value="' + esc(u.Ten) + '">' + esc(u.Ten) + '</option>'; }).join('')
             + '</optgroup>'; }).join('')
  +   '</select></div>'
  + '<div class="field"><label>Người nhận bắt đầu ở trạng thái</label><select id="hoTrangThai">'
  +   ['Cần làm','Đang làm','Chờ duyệt'].map(function(x){
        return '<option' + (x === 'Cần làm' ? ' selected' : '') + '>' + x + '</option>'; }).join('')
  +   '</select><span class="small muted">Chọn <b>Chờ duyệt</b> nếu chuyển để người kia duyệt</span></div>'
  + '<div class="field"></div>'
  + '<div class="field full"><label>Ghi chú bàn giao</label>'
  +   '<textarea id="hoGhiChu" rows="2" placeholder="Việc đã làm tới đâu, người nhận cần làm gì tiếp"></textarea></div>'
  + '</div><div class="modal-foot">'
  + '<button class="btn" onclick="openTaskForm(\'' + taskId + '\')">Quay lại</button>'
  + '<button class="btn primary" onclick="doHandoff(\'' + taskId + '\')">Chuyển tiếp</button></div>');
}

function doHandoff(taskId){
  var nguoi = document.getElementById('hoNhan').value;
  var ghiChu = document.getElementById('hoGhiChu').value.trim();
  var tt = document.getElementById('hoTrangThai').value;
  call('apiHandoff', [S.token, taskId, nguoi, ghiChu, tt], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã chuyển tiếp cho ' + nguoi); reload();
  });
}

/* ---------- Ô chọn người có tìm kiếm ----------
 * Dùng chung cho Người phụ trách (chọn một) và Người theo dõi (chọn nhiều).
 * Giá trị thật nằm ở input ẩn cùng id nên phần lưu không phải sửa gì. */
S.pick = {};

/** Bỏ dấu tiếng Việt để tìm kiếm dễ hơn: gõ "ke toan" vẫn ra "Kế toán" */
function boDau(x){
  return String(x || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function oChonNguoi(id, dsTen, daChon, nhieu, khoa){
  S.pick[id] = {
    ds: dsTen,
    chon: nhieu ? (daChon || []).slice() : (daChon ? [daChon] : []),
    nhieu: !!nhieu, khoa: !!khoa, tim: ''
  };
  return '<div class="pick" id="' + id + 'Wrap">'
    + '<button type="button" class="pick-nut" id="' + id + 'Nut"' + (khoa ? ' disabled' : '')
    +   ' onclick="moPick(event,\'' + id + '\')"><span id="' + id + 'Nhan"></span><i>▾</i></button>'
    + '<div class="pick-panel hidden" id="' + id + 'Panel">'
    +   '<div class="pick-tim"><span class="ico ico-3">' + ic('kinhlup',14) + '</span>'
    +     '<input id="' + id + 'Tim" placeholder="Tìm tên hoặc phòng ban..." oninput="vePick(\'' + id + '\')"></div>'
    +   (nhieu ? '<button type="button" class="pick-all" onclick="pickTatCa(\'' + id + '\')" id="' + id + 'All"></button>' : '')
    +   '<div class="pick-ds" id="' + id + 'Ds"></div>'
    + '</div>'
    + '<input type="hidden" id="' + id + '">'
    + '</div>';
}

function moPick(e, id){
  e.stopPropagation();
  var pn = document.getElementById(id + 'Panel');
  var dangMo = !pn.classList.contains('hidden');
  dongMoiPick();
  if (dangMo) return;
  pn.classList.remove('hidden');
  var tim = document.getElementById(id + 'Tim');
  tim.value = ''; S.pick[id].tim = '';
  vePick(id);
  tim.focus();
}

function dongMoiPick(){
  [].slice.call(document.querySelectorAll('.pick-panel')).forEach(function(x){ x.classList.add('hidden'); });
}
document.addEventListener('click', function(e){
  if (!e.target.closest || !e.target.closest('.pick')) dongMoiPick();
});

/** Vẽ lại danh sách theo từ khoá tìm, và cập nhật nhãn trên nút */
function vePick(id){
  var st = S.pick[id];
  var oTim = document.getElementById(id + 'Tim');
  st.tim = oTim ? oTim.value.trim() : '';
  var tim = boDau(st.tim);

  var loc = st.ds.filter(function(ten){
    if (!tim) return true;
    var u = S.users.filter(function(x){ return x.Ten === ten; })[0] || {};
    return boDau(ten + ' ' + (u.BoPhan || '')).indexOf(tim) >= 0;
  });

  var ds = document.getElementById(id + 'Ds');
  ds.innerHTML = loc.length ? loc.map(function(ten){
      var u = S.users.filter(function(x){ return x.Ten === ten; })[0] || {};
      var co = st.chon.indexOf(ten) >= 0;
      return '<button type="button" class="pick-hang' + (co ? ' chon' : '') + '"'
        + ' onclick="pickChon(\'' + id + '\',\'' + esc(ten).replace(/'/g,'') + '\')">'
        + '<span class="pick-o">' + (co ? '✓' : '') + '</span>'
        + avatarHtml(ten) + '<b>' + esc(ten) + '</b>'
        + '<i>' + esc(u.BoPhan || '') + '</i></button>';
    }).join('')
    : '<div class="pick-trong">Không tìm thấy ai khớp "' + esc(st.tim) + '"</div>';

  var all = document.getElementById(id + 'All');
  if (all){
    var du = st.chon.length === st.ds.length && st.ds.length > 0;
    all.innerHTML = '<span class="pick-o' + (du ? ' chon' : '') + '">' + (du ? '✓' : '') + '</span>'
                  + '<b>' + (du ? 'Bỏ chọn tất cả' : 'Chọn tất cả') + '</b>';
  }
  capNhatNhanPick(id);
}

function capNhatNhanPick(id){
  var st = S.pick[id];
  var nhan = document.getElementById(id + 'Nhan');
  var an = document.getElementById(id);
  if (an) an.value = st.nhieu ? st.chon.join(', ') : (st.chon[0] || '');
  if (!nhan) return;

  if (!st.chon.length){
    nhan.innerHTML = '<span class="muted">' + (st.nhieu ? 'Chưa chọn ai' : 'Chọn người') + '</span>';
  } else if (st.nhieu && st.chon.length > 2){
    nhan.innerHTML = st.chon.slice(0,2).map(function(t){ return avatarHtml(t); }).join('')
                   + '<b>' + st.chon.slice(0,2).join(', ') + '</b>'
                   + '<span class="muted">+' + (st.chon.length - 2) + '</span>';
  } else {
    nhan.innerHTML = st.chon.map(function(t){ return avatarHtml(t) + '<b>' + esc(t) + '</b>'; }).join('');
  }
}

function pickChon(id, ten){
  var st = S.pick[id];
  if (st.khoa) return;
  if (st.nhieu){
    var i = st.chon.indexOf(ten);
    if (i >= 0) st.chon.splice(i, 1); else st.chon.push(ten);
    vePick(id);
  } else {
    st.chon = [ten];
    vePick(id);
    dongMoiPick();
  }
}

function pickTatCa(id){
  var st = S.pick[id];
  st.chon = (st.chon.length === st.ds.length) ? [] : st.ds.slice();
  vePick(id);
}

/* ---------- Màu nhãn, phạm vi, người theo dõi ---------- */
function oMauNhan(dangChon, suaDuoc){
  S.mauDangChon = dangChon || '';
  var kh = suaDuoc ? '' : ' style="pointer-events:none;opacity:.6"';
  return '<div class="hang-cuon mau-hang" id="mauHang"' + kh + '>'
    + '<button type="button" class="mau-o trong' + (!dangChon ? ' chon' : '') + '"'
    +   ' title="Không gắn nhãn" onclick="chonMau(\'\')">✕</button>'
    + MAU_NHAN.map(function(m){
        return '<button type="button" class="mau-o' + (m.ma === dangChon ? ' chon' : '') + '"'
          + ' title="' + esc(m.ten) + '" onclick="chonMau(\'' + m.ma + '\')">'
          + iconO(m.ma, 22) + '</button>';
      }).join('') + '</div>'
    + '<span class="small muted" id="mauTen">' + (dangChon ? 'Nhãn ' + esc(tenMau(dangChon)) : 'Không gắn nhãn') + '</span>';
}

function chonMau(ma){
  S.mauDangChon = ma;
  var hang = document.getElementById('mauHang');
  if (!hang) return;
  [].slice.call(hang.children).forEach(function(b, i){
    var cua = i === 0 ? '' : MAU_NHAN[i-1].ma;
    b.classList.toggle('chon', cua === ma);
    if (cua === ma) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  var ten = document.getElementById('mauTen');
  if (ten) ten.textContent = ma ? 'Nhãn ' + tenMau(ma) : 'Không gắn nhãn';
}

var MO_TA_PV = {
  'Chung':   'Toàn bộ nhân viên đều theo dõi được',
  'Bộ phận': 'Chỉ người trong phòng ban của công việc',
  'Cá nhân': 'Chỉ người phụ trách và người giao việc'
};

function oPhamVi(pv, suaDuoc){
  pv = pv || 'Chung';
  var kh = suaDuoc ? '' : ' disabled';
  var muc = [['Chung', ic('quacau',13), 'Chung'],
             ['Bộ phận', ic('toanha',13), 'Phòng ban'],
             ['Cá nhân', ic('khoa',13), 'Cá nhân']];
  return '<div class="pv-hang">' + muc.map(function(m){
      return '<label class="pv-o" title="' + esc(MO_TA_PV[m[0]]) + '">'
        + '<input type="radio" name="fPV" value="' + m[0] + '"'
        + (m[0] === pv ? ' checked' : '') + kh + ' onchange="moTaPhamVi()">'
        + '<i>' + m[1] + '</i><b>' + m[2] + '</b></label>';
    }).join('') + '</div>'
    + '<span class="small muted" id="pvMoTa">' + esc(MO_TA_PV[pv]) + '</span>';
}

function moTaPhamVi(){
  var o = document.getElementById('pvMoTa');
  if (o) o.textContent = MO_TA_PV[phamViDangChon()] || '';
}
function phamViDangChon(){
  var o = document.querySelector('input[name="fPV"]:checked');
  return o ? o.value : 'Chung';
}

function oTheoDoi(dsHienCo, suaDuoc){
  var ds = String(dsHienCo || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean);
  var nguoi = S.users.filter(function(u){ return u.PhanQuyen !== 'Chỉ xem'; }).map(function(u){ return u.Ten; });
  return oChonNguoi('fTheoDoi', nguoi, ds, true, !suaDuoc)
    + '<span class="small muted">Người theo dõi nhận thông báo và luôn xem được việc, kể cả khi phạm vi là Cá nhân.</span>';
}
function theoDoiDangChon(){
  return (S.pick['fTheoDoi'] || {}).chon || [];
}

/* ---------- Tệp đính kèm ---------- */
var TEP_TOI_DA = 8 * 1024 * 1024;
S.tepDangChon = [];
S.tepCache = {};

function dungLuong(b){
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return Math.round(b/1024) + ' KB';
  return (b/1024/1024).toFixed(1) + ' MB';
}

function chonTep(ev){
  var ds = [].slice.call(ev.target.files || []);
  ev.target.value = '';            // chọn lại cùng file vẫn kích hoạt được
  ds.forEach(function(f){
    if (f.size > TEP_TOI_DA){ toast('"' + f.name + '" nặng ' + dungLuong(f.size) + ', vượt giới hạn 8 MB'); return; }
    if (S.tepDangChon.length >= 5){ toast('Mỗi lần gửi tối đa 5 tệp'); return; }
    var fr = new FileReader();
    fr.onload = function(){
      S.tepDangChon.push({ ten: f.name, loai: f.type, co: f.size,
                           data: String(fr.result).split(',')[1] });
      veTepChon();
    };
    fr.readAsDataURL(f);
  });
}

function veTepChon(){
  var box = document.getElementById('tepChon');
  if (!box) return;
  box.innerHTML = S.tepDangChon.map(function(f, i){
    return '<span class="tep-chip">' + (f.loai.indexOf('image/')===0 ? '🖼' : '📄')
      + ' ' + esc(f.ten) + ' <i>' + dungLuong(f.co) + '</i>'
      + '<button onclick="boTep(' + i + ')" title="Bỏ">✕</button></span>';
  }).join('');
}

function boTep(i){ S.tepDangChon.splice(i, 1); veTepChon(); }

/** Tải lần lượt từng tệp lên rồi mới vẽ lại bình luận */
function guiTepKem(taskId, commentId, xong){
  var ds = S.tepDangChon.slice();
  S.tepDangChon = []; veTepChon();
  if (!ds.length){ xong(); return; }

  var i = 0, loi = 0;
  (function tiep(){
    if (i >= ds.length){
      if (loi) toast(loi + ' tệp không tải lên được');
      xong(); return;
    }
    var f = ds[i++];
    call('apiUploadFile', [S.token, taskId, commentId, f.ten, f.loai, f.data], function(r){
      if (!r.ok){ loi++; toast(f.ten + ': ' + r.msg); }
      tiep();
    });
  })();
}

/* --- Xem PDF bằng PDF.js vẽ lên canvas ---
 * Chrome chặn khung <iframe> chứa PDF khi trang nằm trong hộp cát của Apps Script.
 * Vẽ từng trang lên canvas thì không đụng tới cơ chế xem PDF của trình duyệt,
 * nên không bị chặn. */
var PDFJS_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WRK = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function napPdfJs(xong, loi){
  if (window.pdfjsLib){ xong(); return; }
  var sc = document.createElement('script');
  sc.src = PDFJS_JS;
  sc.onload = function(){
    try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WRK; } catch(e){}
    xong();
  };
  sc.onerror = function(){ loi(); };
  document.head.appendChild(sc);
}

function b64ToBytes_(b64){
  var bin = atob(b64), n = bin.length, arr = new Uint8Array(n);
  for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function blobUrl_(b64, loai){ return URL.createObjectURL(new Blob([b64ToBytes_(b64)], { type: loai })); }

/** Mở tệp xem thẳng trong app. Ảnh và PDF đều không cần tải về. */
function moTep(id, ten, loai){
  S.xemQuayLai = S.formDangMo;            // nhớ form đang mở để lát quay lại đúng chỗ
  var c = S.tepCache[id];
  if (c){ veKhungXem(c); return; }

  openModal('<h3>' + (String(loai).indexOf('image/')===0 ? '🖼' : '📄') + ' ' + esc(ten) + '</h3>'
    + '<div class="dang-tai"><div class="spinner"></div>'
    + '<p class="muted small">Đang lấy tệp qua app. Tệp càng nặng càng lâu.</p></div>');

  call('apiGetFile', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); dongKhungXem(); return; }
    S.tepCache[id] = { id: id, ten: r.ten, loai: r.loai, b64: r.data,
                       url: blobUrl_(r.data, r.loai), tyLe: 1.3 };
    veKhungXem(S.tepCache[id]);
  });
}

function veKhungXem(f){
  var laAnh = String(f.loai).indexOf('image/') === 0;
  openModal(
    '<div class="xem-head"><b>' + (laAnh ? '🖼' : '📄') + ' ' + esc(f.ten) + '</b>'
    + '<span class="xem-nut">'
    +   (laAnh ? '' : '<button class="btn sm" onclick="phongTo(\'' + f.id + '\',-1)">−</button>'
                    + '<span class="small muted" id="pdfTyLe"></span>'
                    + '<button class="btn sm" onclick="phongTo(\'' + f.id + '\',1)">+</button>')
    +   '<button class="btn sm" onclick="taiVe(\'' + f.id + '\')">⬇ Tải về</button>'
    +   '<button class="btn primary sm" onclick="dongKhungXem()">'
    +     (S.xemQuayLai ? '← Quay lại' : 'Đóng') + '</button></span></div>'
    + (laAnh
        ? '<img class="tep-xem" src="' + f.url + '" alt="' + esc(f.ten) + '">'
        : '<div id="pdfHop" class="pdf-hop"><div class="dang-tai"><div class="spinner"></div>'
          + '<p class="muted small">Đang dựng trang...</p></div></div>'));

  if (!laAnh) veTrangPdf(f);
}

function veTrangPdf(f){
  var hop = document.getElementById('pdfHop');
  var ty = document.getElementById('pdfTyLe');
  if (ty) ty.textContent = Math.round(f.tyLe / 1.3 * 100) + '%';

  napPdfJs(function(){
    // Mỗi lần vẽ phải tạo mảng byte mới: pdf.js chiếm quyền quản lý bộ đệm cũ
    window.pdfjsLib.getDocument({ data: b64ToBytes_(f.b64) }).promise.then(function(pdf){
      hop.innerHTML = '';
      var i = 1;
      (function tiep(){
        if (i > pdf.numPages) return;
        pdf.getPage(i++).then(function(page){
          var vp = page.getViewport({ scale: f.tyLe });
          var cv = document.createElement('canvas');
          cv.className = 'pdf-trang';
          cv.width = vp.width; cv.height = vp.height;
          hop.appendChild(cv);
          page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(tiep);
        });
      })();
    }).catch(function(e){
      hop.innerHTML = '<p class="muted" style="padding:20px;text-align:center">Không đọc được nội dung PDF.<br>'
        + esc(e && e.message ? e.message : e) + '</p>';
    });
  }, function(){
    hop.innerHTML = '<p class="muted" style="padding:20px;text-align:center">'
      + 'Không tải được bộ đọc PDF (mạng công ty có thể đang chặn cdnjs.cloudflare.com).<br>'
      + 'Hãy bấm <b>⬇ Tải về</b> để mở bằng phần mềm trên máy.</p>';
  });
}

function phongTo(id, huong){
  var f = S.tepCache[id];
  if (!f) return;
  f.tyLe = Math.min(3.2, Math.max(0.6, f.tyLe + huong * 0.3));
  veTrangPdf(f);
}

/** Đóng khung xem: có form phía sau thì quay lại đúng form đó, không văng ra ngoài */
function dongKhungXem(){
  var ve = S.xemQuayLai;
  S.xemQuayLai = null;
  if (!ve){ closeModal(); return; }
  // Công việc thì nhớ bằng ID, phiếu đăng ký xe thì nhớ bằng hàm mở lại chính nó
  if (typeof ve === 'function') ve(); else openTaskForm(ve);
  setTimeout(function(){
    var el = document.querySelector('.cmt-sec');
    if (el) el.scrollIntoView({ block: 'center' });
  }, 400);
}

function taiVe(id){
  var f = S.tepCache[id];
  if (f){ taiBlobUrl_(f.url, f.ten); return; }
  call('apiGetFile', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    S.tepCache[id] = { id: id, ten: r.ten, loai: r.loai, b64: r.data,
                       url: blobUrl_(r.data, r.loai), tyLe: 1.3 };
    taiBlobUrl_(S.tepCache[id].url, r.ten);
  });
}

function taiBlobUrl_(url, ten){
  try {
    var a = document.createElement('a');
    a.href = url; a.download = ten;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ a.remove(); }, 2000);
    toast('Đã tải ' + ten);
  } catch (e) {
    toast('Trình duyệt chặn tải tệp.');
  }
}

function xoaTep(id, taskId){
  if (!confirm('Xoá tệp này?')) return;
  call('apiDeleteFile', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã xoá tệp'); loadComments(taskId);
  });
}

/* ---------- Khay tệp chờ khi TẠO MỚI ----------
 * Lúc tạo chưa có ID công việc nên chưa gắn tệp lên server được.
 * Giữ tạm ở máy, tạo xong có ID rồi mới tải lên. */
S.tepMoi = [];

function khoiTepMoi(){
  return '<div class="field full"><label class="lb-ai">Tài liệu đính kèm'
    + '<button type="button" class="btn sm" onclick="themLinkMoi()">' + ic('lienket',13) + ' Thêm link</button></label>'
    + '<input type="file" id="tepMoiInput" multiple'
    +   ' accept="application/pdf,image/png,image/jpeg,image/gif,image/webp"'
    +   ' style="display:none" onchange="chonTepMoi(event)">'
    + '<div class="thavao" id="thaVaoMoi" onclick="document.getElementById(\'tepMoiInput\').click()"'
    +   ' ondragover="keoQuaMoi(event,1)" ondragleave="keoQuaMoi(event,0)" ondrop="thaTepMoi(event)">'
    +   '<div class="thavao-ico">⬆</div>'
    +   '<div><b>Bấm để tải lên</b> hoặc kéo thả tệp vào đây</div>'
    +   '<small>PDF và ảnh (PNG, JPG, GIF, WEBP) · mỗi tệp dưới 8 MB</small>'
    + '</div>'
    + '<div id="tepMoiList" class="tep-list"></div>'
    + '<span class="small muted">Tệp sẽ được tải lên ngay sau khi tạo xong.</span></div>';
}

function keoQuaMoi(ev, vao){
  ev.preventDefault(); ev.stopPropagation();
  var o = document.getElementById('thaVaoMoi');
  if (o) o.classList.toggle('dang-keo', !!vao);
}
function thaTepMoi(ev){
  ev.preventDefault(); ev.stopPropagation(); keoQuaMoi(ev, 0);
  nhanTepMoi([].slice.call((ev.dataTransfer || {}).files || []));
}
function chonTepMoi(ev){
  var ds = [].slice.call(ev.target.files || []);
  ev.target.value = '';
  nhanTepMoi(ds);
}

function nhanTepMoi(ds){
  var hopLe = ds.filter(function(f){
    return f.type === 'application/pdf' || f.type.indexOf('image/') === 0;
  });
  if (hopLe.length < ds.length) toast('Bỏ qua ' + (ds.length - hopLe.length) + ' tệp không phải PDF hoặc ảnh');
  hopLe.forEach(function(f){
    if (f.size > TEP_TOI_DA){ toast('"' + f.name + '" vượt 8 MB'); return; }
    var fr = new FileReader();
    fr.onload = function(){
      S.tepMoi.push({ ten: f.name, loai: f.type, co: f.size,
                      data: String(fr.result).split(',')[1] });
      veTepMoi();
    };
    fr.readAsDataURL(f);
  });
}

function themLinkMoi(){
  var url = prompt('Dán đường link (bắt đầu bằng https://):');
  if (!url) return;
  if (!/^https?:\/\//i.test(url)){ toast('Link phải bắt đầu bằng http:// hoặc https://'); return; }
  var ten = prompt('Đặt tên hiển thị cho link (bỏ trống thì dùng chính đường link):') || url;
  S.tepMoi.push({ ten: ten, loai: 'link', url: url });
  veTepMoi();
}

function veTepMoi(){
  var box = document.getElementById('tepMoiList');
  if (!box) return;
  box.innerHTML = S.tepMoi.map(function(f, i){
    return '<span class="tep-chip">'
      + (f.loai === 'link' ? '🔗' : (f.loai.indexOf('image/') === 0 ? '🖼' : '📄'))
      + ' ' + esc(f.ten) + (f.co ? ' <i>' + dungLuong(f.co) + '</i>' : '')
      + '<button onclick="boTepMoi(' + i + ')" title="Bỏ">✕</button></span>';
  }).join('');
}
function boTepMoi(i){ S.tepMoi.splice(i, 1); veTepMoi(); }

/** Tạo xong thì tải lần lượt khay tệp lên công việc vừa có ID */
function taiKhayLen(taskId, xong){
  var ds = S.tepMoi.slice();
  S.tepMoi = [];
  if (!ds.length){ xong(); return; }

  var i = 0, loi = 0;
  toast('Đang tải ' + ds.length + ' tài liệu lên...');
  (function tiep(){
    if (i >= ds.length){
      if (loi) toast(loi + ' tài liệu không tải lên được');
      xong(); return;
    }
    var f = ds[i++];
    var ham = f.loai === 'link' ? 'apiAddLink' : 'apiUploadFile';
    var args = f.loai === 'link'
      ? [S.token, taskId, f.ten, f.url]
      : [S.token, taskId, '', f.ten, f.loai, f.data];
    call(ham, args, function(r){
      if (!r.ok){ loi++; toast(f.ten + ': ' + r.msg); }
      tiep();
    });
  })();
}

/* ---------- Đính kèm gắn thẳng vào công việc ---------- */
function loadTepTask(taskId){
  call('apiGetTaskFiles', [S.token, taskId], function(ds){
    var box = document.getElementById('tepTaskList');
    if (!box) return;
    box.classList.remove('muted','small');
    if (!ds.length){
      box.innerHTML = '<span class="muted small">Chưa có đính kèm nào.</span>';
      return;
    }
    box.innerHTML = ds.map(function(f){ return theTep(f, taskId); }).join('');
  });
}

/** Một thẻ đính kèm: link thì mở tab mới, tệp thì xem trong app */
function theTep(f, taskId){
  var xoaDuoc = (f.NguoiTai === S.me.Ten || S.me.VaiTro === 'Admin');
  var nut = xoaDuoc
    ? '<button class="tep-x" title="Xoá" onclick="xoaTepTask(\'' + f.ID + '\',\'' + taskId + '\')">✕</button>'
    : '';
  if (f.laLink){
    return '<a class="tep-chip xem" href="' + esc(f.Url) + '" target="_blank" rel="noopener noreferrer">'
      + '🔗 ' + esc(f.TenFile) + '</a>' + nut;
  }
  return '<span class="tep-chip xem" onclick="moTep(\'' + f.ID + '\',\''
    + esc(f.TenFile).replace(/'/g, '') + '\',\'' + f.Loai + '\')">'
    + (f.laAnh ? '🖼' : '📄') + ' ' + esc(f.TenFile) + ' <i>' + dungLuong(f.KichThuoc) + '</i></span>' + nut;
}

/** Đổi giao diện khi rê tệp qua vùng thả */
function keoQua(ev, vao){
  ev.preventDefault(); ev.stopPropagation();
  var o = document.getElementById('thaVao');
  if (o) o.classList.toggle('dang-keo', !!vao);
}

function thaTep(ev, taskId){
  ev.preventDefault(); ev.stopPropagation();
  keoQua(ev, 0);
  var ds = [].slice.call((ev.dataTransfer || {}).files || []);
  if (!ds.length){ toast('Không nhận được tệp nào'); return; }
  taiLenNhieu(ds, taskId);
}

function chonTepTask(ev, taskId){
  var ds = [].slice.call(ev.target.files || []);
  ev.target.value = '';
  if (!ds.length) return;
  taiLenNhieu(ds, taskId);
}

function taiLenNhieu(ds, taskId){
  var hopLe = ds.filter(function(f){
    return f.type === 'application/pdf' || f.type.indexOf('image/') === 0;
  });
  if (hopLe.length < ds.length) toast('Bỏ qua ' + (ds.length - hopLe.length) + ' tệp không phải PDF hoặc ảnh');
  if (!hopLe.length) return;

  var con = hopLe.length;
  toast('Đang tải ' + con + ' tệp lên...');
  hopLe.forEach(function(f){
    if (f.size > TEP_TOI_DA){ toast('"' + f.name + '" vượt 8 MB'); if (!--con) loadTepTask(taskId); return; }
    var fr = new FileReader();
    fr.onload = function(){
      call('apiUploadFile', [S.token, taskId, '', f.name, f.type, String(fr.result).split(',')[1]], function(r){
        if (!r.ok) toast(f.name + ': ' + r.msg);
        if (!--con) loadTepTask(taskId);
      });
    };
    fr.readAsDataURL(f);
  });
}

function themLink(taskId){
  var url = prompt('Dán đường link (bắt đầu bằng https://):');
  if (!url) return;
  var ten = prompt('Đặt tên hiển thị cho link (bỏ trống thì dùng chính đường link):') || '';
  call('apiAddLink', [S.token, taskId, ten, url], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã thêm link'); loadTepTask(taskId);
  });
}

function xoaTepTask(id, taskId){
  if (!confirm('Xoá đính kèm này?')) return;
  call('apiDeleteFile', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã xoá'); loadTepTask(taskId);
  });
}

/* ---------- Bình luận ---------- */
/** Khối trao đổi dùng chung cho form công việc và phiếu đăng ký xe.
 *  Gọi xong phải chạy moTraoDoi(taskId) để nạp bình luận và dọn tệp đang chọn. */
function khoiTraoDoi(taskId){
  return '<div class="cmt-sec"><label class="cmt-title">💬 Trao đổi</label>'
    + '<div id="cmtList" class="cmt-list muted small">Đang tải bình luận...</div>'
    + '<div id="tepChon" class="tep-chon"></div>'
    + '<div class="cmt-box">'
    +   '<input type="file" id="tepInput" multiple'
    +   ' accept="application/pdf,image/png,image/jpeg,image/gif,image/webp"'
    +   ' style="display:none" onchange="chonTep(event)">'
    +   '<button class="btn sm" title="Đính kèm PDF hoặc ảnh"'
    +   ' onclick="document.getElementById(\'tepInput\').click()">📎</button>'
    +   '<textarea id="cmtInput" rows="2" placeholder="Viết trao đổi... gõ @ để nhắc tên,'
    +   ' bấm 📎 để đính kèm PDF hoặc ảnh"></textarea>'
    +   '<button class="btn primary sm" onclick="addComment(\'' + taskId + '\')">Gửi</button></div>'
    + '<div class="small muted" id="cmtHint"></div></div>';
}

/** Mở phần trao đổi: xoá tệp còn sót của lần trước rồi nạp bình luận */
function moTraoDoi(taskId){
  S.tepDangChon = [];
  veTepChon();
  loadComments(taskId);
}

function loadComments(taskId){
  call('apiGetComments', [S.token, taskId], function(rows){
    var box = document.getElementById('cmtList');
    if (!box) return;
    if (!rows.length){ box.innerHTML = '<div class="muted small">Chưa có trao đổi nào.</div>'; return; }
    box.classList.remove('muted','small');
    box.innerHTML = rows.map(function(c){
      var xoa = (c.NguoiGui === S.me.Ten || S.me.VaiTro === 'Admin')
        ? '<button class="cmt-del" title="Xoá" onclick="delComment(\'' + c.ID + '\',\'' + taskId + '\')">✕</button>' : '';
      return '<div class="cmt">' + avatarHtml(c.NguoiGui)
        + '<div class="cmt-body"><div class="cmt-head"><b>' + esc(c.NguoiGui) + '</b>'
        + '<span class="muted small">' + esc(String(c.ThoiGian).slice(0,16)) + '</span>' + xoa + '</div>'
        + '<div class="cmt-text">' + highlightMentions(c.NoiDung) + '</div>'
        + ((c.tep && c.tep.length) ? '<div class="tep-list">' + c.tep.map(function(f){
            var xoaDuoc = (f.NguoiTai === S.me.Ten || S.me.VaiTro === 'Admin');
            return '<span class="tep-chip xem" onclick="moTep(\'' + f.ID + '\',\''
              + esc(f.TenFile).replace(/'/g, '') + '\',\'' + f.Loai + '\')">'
              + (f.laAnh ? '🖼' : '📄') + ' ' + esc(f.TenFile)
              + ' <i>' + dungLuong(f.KichThuoc) + '</i></span>'
              + (xoaDuoc ? '<button class="tep-x" title="Xoá tệp" onclick="xoaTep(\'' + f.ID
                 + '\',\'' + taskId + '\')">✕</button>' : '');
          }).join('') + '</div>' : '')
        + '</div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  });
}

function highlightMentions(txt){
  var out = esc(txt);
  S.users.forEach(function(u){
    out = out.split('@' + esc(u.Ten)).join('<span class="mention">@' + esc(u.Ten) + '</span>');
  });
  return out.replace(/\n/g, '<br>');
}

function addComment(taskId){
  var el = document.getElementById('cmtInput');
  var txt = el.value.trim();
  var coTep = S.tepDangChon.length > 0;
  if (!txt && !coTep){ toast('Nhập nội dung hoặc đính kèm tệp'); return; }
  if (!txt) txt = '(gửi tệp đính kèm)';      // có tệp mà không viết gì thì ghi chú giúp

  call('apiAddComment', [S.token, taskId, txt], function(r){
    if (!r.ok){ toast(r.msg); return; }
    el.value = '';
    S.soBinhLuan[taskId] = (S.soBinhLuan[taskId] || 0) + 1;
    guiTepKem(taskId, r.comment ? r.comment.ID : '', function(){ loadComments(taskId); });
  });
}

function delComment(id, taskId){
  if (!confirm('Xoá bình luận này?')) return;
  call('apiDeleteComment', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    S.soBinhLuan[taskId] = Math.max(0, (S.soBinhLuan[taskId] || 1) - 1);
    loadComments(taskId);
  });
}

function addSubRow(s, khoa){
  var w = document.getElementById('subWrap');
  var kh = khoa ? ' disabled' : '';
  var d = document.createElement('div');
  d.className = 'sub-row';
  d.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  d.innerHTML = '<input type="checkbox"'+kh+' '+(s&&s.HoanThanh?'checked':'')+'>'
    + '<input class="s-nd"'+kh+' placeholder="Nội dung" value="'+esc(s?s.NoiDung:'')+'">'
    + '<input class="s-gc"'+kh+' placeholder="Ghi chú" value="'+esc(s?s.GhiChu:'')+'">'
    + (khoa ? '' : '<button class="btn sm" onclick="this.parentNode.remove()" style="color:#ef4444">✕</button>');
  w.appendChild(d);
}

function collectSubs(){
  return [].slice.call(document.querySelectorAll('#subWrap .sub-row')).map(function(r){
    return { HoanThanh: r.querySelector('input[type=checkbox]').checked,
             NoiDung: r.querySelector('.s-nd').value.trim(),
             GhiChu:  r.querySelector('.s-gc').value.trim() };
  }).filter(function(s){ return s.NoiDung; });
}

function saveTask(id, chiTrangThai){
  var v = function(x){ return document.getElementById(x).value; };

  // Không có quyền sửa nội dung thì chỉ gửi trạng thái và tiến độ
  if (chiTrangThai){
    call('apiUpdateTask', [S.token, {
      ID: id, TrangThai: v('fTT'), TienDo: Number(v('fTD')) || 0
    }], function(r){
      if (!r.ok){ toast(r.msg); return; }
      closeModal(); toast('Đã cập nhật trạng thái'); reload();
    });
    return;
  }

  if (!v('fTen').trim()) { toast('Nhập tên công việc'); return; }
  if (v('fHC') < v('fBD')) { toast('Hạn chót phải sau ngày bắt đầu'); return; }
  var data = {
    ID: id || undefined,
    TenCongViec: v('fTen').trim(), MoTa: v('fMoTa'), PhuTrach: v('fPT'), BoPhan: v('fBP'),
    MucDo: v('fMD'), TrangThai: v('fTT'), TanSuat: v('fTS'), LinhVuc: v('fLV'),
    MauNhan: S.mauDangChon || '', PhamVi: phamViDangChon(), NguoiTheoDoi: theoDoiDangChon(),
    TienDo: Number(v('fTD')) || 0, NgayBatDau: v('fBD'), HanChot: v('fHC'),
    subtasks: collectSubs()
  };
  if (document.getElementById('fCanCu')) data.CanCu = v('fCanCu');
  if (document.getElementById('fKinhTrinh')) data.KinhTrinh = v('fKinhTrinh').trim();
  call(id ? 'apiUpdateTask' : 'apiCreateTask', [S.token, data], function(r){
    if (!r.ok) { toast(r.msg); return; }
    if (id){ closeModal(); toast('Đã cập nhật'); reload(); return; }
    taiKhayLen(r.id, function(){
      closeModal(); toast('Đã tạo công việc'); reload();
    });
  });
}

function delTask(id){
  if (!confirm('Xoá công việc này?')) return;
  call('apiDeleteTask', [S.token, id], function(r){
    if (!r.ok) { toast(r.msg); return; }
    closeModal(); toast('Đã xoá'); reload();
  });
}

/** Đổi trạng thái một công việc (kéo thả Kanban, hoặc ô chọn ở Danh sách).
 *  Thẻ nhảy sang cột mới ngay lập tức rồi mới lưu ngầm, nên không có
 *  vòng tròn chờ nào chen vào giữa thao tác. Máy chủ từ chối thì thẻ
 *  tự quay về cột cũ kèm lời báo. */
function quickStatus(id, tt){
  var t = S.tasks.filter(function(x){ return String(x.ID) === String(id); })[0];
  if (!t || t.TrangThai === tt) return;        // thả lại đúng cột cũ thì thôi

  var cu = { TrangThai:t.TrangThai, TienDo:t.TienDo, NgayHoanThanh:t.NgayHoanThanh,
             NguoiHoanThanh:t.NguoiHoanThanh, ThuTu:t.ThuTu };

  // Áp đúng những quy tắc máy chủ sẽ áp, để màn hình khớp ngay với kết quả lưu
  t.TrangThai = tt;
  t.ThuTu = Date.now();
  if (tt === 'Hoàn thành') {
    t.TienDo = 100; t.NgayHoanThanh = today(); t.NguoiHoanThanh = S.me.Ten;
  } else {
    t.NgayHoanThanh = '';
    if (cu.TrangThai === 'Hoàn thành') t.NguoiHoanThanh = '';
  }
  render();

  callNgam('apiMoveTask', [S.token, id, tt, t.ThuTu], function(r){
    if (r && r.ok) return;                     // lưu xong, không động vào màn hình nữa
    t.TrangThai = cu.TrangThai; t.TienDo = cu.TienDo;
    t.NgayHoanThanh = cu.NgayHoanThanh; t.NguoiHoanThanh = cu.NguoiHoanThanh;
    t.ThuTu = cu.ThuTu;
    render();
    toast((r && r.msg) || 'Không lưu được trạng thái, đã trả về như cũ');
  });
}

function reload(xong){
  call('apiBootstrap', [S.token], function(r){
    if (!r.ok){ if (xong) xong(false); return; }
    S.tasks = r.tasks; S.subtasks = r.subtasks; S.notifications = r.notifications; S.users = r.users;
    S.soBinhLuan = r.soBinhLuan || {}; S.tinChuaDoc = r.tinChuaDoc || 0;
    renderBadge(); render();
    if (xong) xong(true);
  });
}

/* ============ KHỞI ĐỘNG ============ */
(function init(){
  try {
    theoDoiGio();
    var tk = localStorage.getItem('tp_token');
    if (tk) { S.token = tk; boot(); }
  } catch(e){}
})();

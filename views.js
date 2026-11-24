/* ============ ĐIỀU PHỐI VIEW ============ */
function render(){
  var el = document.getElementById('view');
  var fn = { dashboard:viewDashboard, stats:viewStats, gantt:viewGantt, kanban:viewKanban,
             list:viewList, calendar:viewCalendar, history:viewHistory, users:viewUsers,
             settings:viewSettings, recurring:viewRecurring,
             chat:viewChat, totrinh:viewToTrinh, xe:viewXe, phong:viewPhong }[S.view];
  el.innerHTML = fn ? fn() : '';
  donIcon(el);
  demSoLen(el);          // chạy số lên sau khi đã dựng xong khung
  if (S.view === 'kanban' && !laDienThoai()) bindKanbanDnD();
  // Tổng quan có ô tin nhắn nhóm; nạp ngầm một lần rồi vẽ lại, không hiện vòng chờ
  if (S.view === 'dashboard' && !S.rooms.length && !S._dangNapPhong){
    S._dangNapPhong = true;
    callNgam('apiGetRooms', [S.token], function(r){
      S._dangNapPhong = false;
      if (!r || !r.length) return;
      S.rooms = r;
      if (S.view === 'dashboard') render();
    });
  }
  if (S.view === 'history') loadHistory();
  if (S.view === 'settings') loadSettings();
  if (S.view === 'recurring') loadRules();
  if (S.view === 'chat') loadRooms();
  if (S.view === 'xe') loadXe();
  if (S.view === 'phong') loadPhong();
}

/* ============ BIỂU ĐỒ ============ */
function donut(items, tong){
  var R = 52, C = 2 * Math.PI * R, off = 0;
  var segs = items.filter(function(i){return i.value>0;}).map(function(i){
    var len = tong ? i.value / tong * C : 0;
    var s = '<circle r="'+R+'" cx="70" cy="70" fill="none" stroke="'+i.color+'" stroke-width="18"'
          + ' stroke-dasharray="'+len+' '+(C-len)+'" stroke-dashoffset="'+(-off)+'"'
          + ' transform="rotate(-90 70 70)"><title>'+esc(i.key)+': '+i.value+'</title></circle>';
    off += len; return s;
  }).join('');
  return '<div class="donut-wrap"><svg width="140" height="140" viewBox="0 0 140 140">'
    + '<circle r="52" cx="70" cy="70" fill="none" stroke="var(--border)" stroke-width="18"/>'
    + segs
    + '<text x="70" y="66" text-anchor="middle" font-size="22" font-weight="800" fill="currentColor">'+tong+'</text>'
    + '<text x="70" y="86" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">Tổng công việc</text>'
    + '</svg><div class="legend">'
    + items.map(function(i){
        return '<div class="li"><span class="dot" style="background:'+i.color+'"></span>'+esc(i.key)
             + '<span class="val">'+i.value+' ('+(tong?Math.round(i.value/tong*100):0)+'%)</span></div>';
      }).join('') + '</div></div>';
}

function hbars(rows, max, color){
  return '<div class="hbars">' + rows.map(function(r){
    return '<div class="row"><span class="nm">'+esc(r.key)+'</span>'
         + '<span class="bar"><i style="width:'+(max?r.value/max*100:0)+'%;background:'+(color||'var(--info)')+'"></i></span>'
         + '<b>'+r.value+'</b></div>';
  }).join('') + '</div>';
}

function groupCount(list, key){
  var m = {};
  list.forEach(function(t){ var k = t[key] || '(trống)'; m[k] = (m[k]||0)+1; });
  return Object.keys(m).map(function(k){ return {key:k, value:m[k]}; });
}

function statusTabs(list){
  var all = S.tasks.length;
  return '<div class="tabs"><button class="tab'+(S.statusTab?'':' active')+'" onclick="S.statusTab=\'\';render()">Tất cả ('+all+')</button>'
    + TRANG_THAI.map(function(tt){
        var n = S.tasks.filter(function(t){return t.TrangThai===tt;}).length;
        return '<button class="tab'+(S.statusTab===tt?' active':'')+'" onclick="S.statusTab=\''+tt+'\';render()">'+tt+' ('+n+')</button>';
      }).join('') + '</div>';
}

/* ============ 1. TỔNG QUAN ============ */
/* =========================================================
   TỔNG QUAN — dựng theo mẫu Taskly.
   Mọi con số ở đây tính từ dữ liệu thật của Task Pro; không có
   chỗ nào ghi số minh hoạ. Mẫu có mục "focus session" nhưng
   Task Pro không đo thời gian tập trung, nên chỗ đó thay bằng
   nhịp việc theo thứ trong tuần — thứ đo được thật.
   ========================================================= */

/** Vòng cung đo, kiểu đồng hồ nửa vòng như trong mẫu */
function cungDo(pct, mau){
  var p = Math.max(0, Math.min(100, Number(pct) || 0));
  var R = 46, C = Math.PI * R;                   // nửa chu vi
  var chay = C * p / 100;
  return '<svg class="cung" viewBox="0 0 120 68" width="116" height="66" role="img"'
    +   ' aria-label="' + p + ' phần trăm">'
    + '<path d="M12 58 A46 46 0 0 1 108 58" fill="none" stroke="var(--chart-grid)"'
    +   ' stroke-width="13" stroke-linecap="round"/>'
    + '<path class="chay" d="M12 58 A46 46 0 0 1 108 58" fill="none" stroke="' + mau + '"'
    +   ' stroke-width="13" stroke-linecap="round"'
    +   ' stroke-dasharray="' + chay.toFixed(1) + ' ' + (C - chay).toFixed(1) + '"'
    +   ' style="--chay:' + chay.toFixed(1) + '"/>'
    + '</svg>';
}

/** Cột theo tháng, cột cao nhất tô đặc và có bong bóng số như mẫu */
function cotThang(cot){
  var max = Math.max.apply(null, [1].concat(cot.map(function(c){ return c.v; })));
  var noiBat = 0;
  cot.forEach(function(c, i){ if (c.v > cot[noiBat].v) noiBat = i; });
  // Mốc trục phải là số nguyên và không trùng nhau: làm tròn bước lên số đẹp
  var buoc = Math.max(1, Math.ceil(max / 4));
  var dinh = buoc * 4;
  var moc = [4, 3, 2, 1, 0].map(function(i){ return buoc * i; });

  return '<div class="cot-khung">'
    + '<div class="cot-truc">' + moc.map(function(m){ return '<span>' + m + '</span>'; }).join('') + '</div>'
    + '<div class="cot-vung">' + cot.map(function(c, i){
        // Tháng không có việc nào thì KHÔNG vẽ cột: vẽ mẩu cụt sẽ đọc nhầm thành "có một ít"
        var h = c.v ? Math.max(6, Math.round(c.v / dinh * 100)) : 0;
        var dac = c.v > 0 && i === noiBat;
        return '<div class="cot-o' + (dac ? ' dac' : '') + '" tabindex="0"'
          + ' style="--i:' + i + '" role="img"'
          + ' aria-label="' + esc(c.ten) + ': ' + c.v + ' việc">'
          + '<span class="cot-bong">' + c.v + '</span>'
          + (h ? '<span class="cot-than" style="--h:' + h + '%"></span>' : '<span class="cot-khong"></span>')
          + '<span class="cot-ten">' + esc(c.ten) + '</span></div>';
      }).join('') + '</div></div>';
}

/** Hai đường cong mượt: việc giao ra và việc chốt xong theo thứ trong tuần */
function duongTuan(a, b, nhan){
  var W = 300, H = 110, n = nhan.length;
  var max = Math.max.apply(null, [1].concat(a).concat(b));
  var x = function(i){ return n < 2 ? W / 2 : i * W / (n - 1); };
  var y = function(v){ return H - 8 - (v / max) * (H - 20); };
  var duong = function(ds){
    if (!ds.length) return '';
    var d = 'M' + x(0).toFixed(1) + ' ' + y(ds[0]).toFixed(1);
    for (var i = 1; i < ds.length; i++){
      var xp = x(i - 1), xc = x(i), gx = (xp + xc) / 2;
      d += ' C' + gx.toFixed(1) + ' ' + y(ds[i-1]).toFixed(1)
         + ', ' + gx.toFixed(1) + ' ' + y(ds[i]).toFixed(1)
         + ', ' + xc.toFixed(1) + ' ' + y(ds[i]).toFixed(1);
    }
    return d;
  };
  var dA = duong(a), dB = duong(b);
  return '<svg class="tuan-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"'
    + ' role="img" aria-label="Nhịp việc theo thứ trong tuần">'
    + (dA ? '<path class="vung" d="' + dA + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="var(--xanh-mo)" stroke="none"/>' : '')
    + (dA ? '<path class="duong" pathLength="1" d="' + dA + '" fill="none" stroke="var(--xanh)" stroke-width="2.4" stroke-linecap="round"/>' : '')
    + (dB ? '<path class="duong sau" pathLength="1" d="' + dB + '" fill="none" stroke="var(--cam)" stroke-width="2.4" stroke-linecap="round"/>' : '')
    + '</svg>'
    + '<div class="tuan-ten">' + nhan.map(function(t, i){
        return '<span' + (i === new Date().getDay() - 1 ? ' class="nay"' : '') + '>' + esc(t) + '</span>'; }).join('') + '</div>';
}

/** Đếm theo tháng trong N tháng gần đây, theo ngày hoàn thành thật */
function viecTheoThang(list, soThang){
  var nay = new Date(), ra = [];
  var TEN = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12'];
  for (var i = soThang - 1; i >= 0; i--){
    var d = new Date(nay.getFullYear(), nay.getMonth() - i, 1);
    var ma = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    ra.push({ ten: TEN[d.getMonth()], ma: ma,
      v: list.filter(function(t){ return String(t.NgayHoanThanh || '').slice(0, 7) === ma; }).length });
  }
  return ra;
}

/** So với kỳ trước cùng độ dài, để ra mũi tên tăng giảm */
function soKyTruoc(nay, truoc){
  if (!truoc) return null;
  return Math.round((nay - truoc) / truoc * 100);
}

function veDelta(d){
  if (d === null || !isFinite(d) || d === 0) return '';
  var len = d > 0;
  return '<span class="delta ' + (len ? 'len' : 'xuong') + '">'
    + (len ? '+' : '') + d + '% ' + (len ? '↑' : '↓') + '</span>';
}

function viewDashboard(){
  var list = filtered();
  var toi  = S.me.Ten;

  /* ---------- Thẻ đo ---------- */
  var xong   = list.filter(function(t){ return t.TrangThai === 'Hoàn thành'; });
  var tyLe   = list.length ? Math.round(xong.length / list.length * 100) : 0;
  var dungHan = xong.filter(function(t){
    return !t.HanChot || !t.NgayHoanThanh || t.NgayHoanThanh <= t.HanChot; }).length;
  var tyDung = xong.length ? Math.round(dungHan / xong.length * 100) : 0;
  var dangChay = list.filter(function(t){ return t.TrangThai === 'Đang làm' || t.TrangThai === 'Chờ duyệt'; }).length;
  var tyChay = list.length ? Math.round(dangChay / list.length * 100) : 0;

  // Kỳ trước cùng độ dài, tính trên TOÀN BỘ việc chứ không qua bộ lọc thời gian
  var r = dateRange(S.filter.thoiGian);
  var truocTyLe = null;
  if (r){
    var d1 = new Date(r[0] + 'T00:00:00'), d2 = new Date(r[1] + 'T00:00:00');
    var dai = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    var tA = lymd(new Date(d1.getTime() - dai * 86400000));
    var tB = lymd(new Date(d1.getTime() - 86400000));
    var ky = S.tasks.filter(function(t){
      return (t.HanChot || '') >= tA && (t.HanChot || '') <= tB; });
    var kyXong = ky.filter(function(t){ return t.TrangThai === 'Hoàn thành'; }).length;
    if (ky.length) truocTyLe = Math.round(kyXong / ky.length * 100);
  }

  var theDo = [
    ['Tỷ lệ hoàn thành', tyLe + '%', tyLe, 'var(--xanh)', ic('tick'),
     veDelta(truocTyLe === null ? null : tyLe - truocTyLe), xong.length + '/' + list.length + ' việc', 0],
    ['Hoàn thành đúng hạn', tyDung + '%', tyDung, 'var(--doi-nghich)', ic('dongho'), '',
     dungHan + '/' + (xong.length || 0) + ' việc đã chốt', 1],
    ['Đang chạy', String(dangChay), tyChay, 'var(--cam)', ic('nguon'), '',
     list.filter(isOverdue).length + ' việc quá hạn', 2]
  ];

  /* ---------- Dải đầu ---------- */
  var nguoi = {};
  list.forEach(function(t){ if (t.PhuTrach) nguoi[t.PhuTrach] = 1; });
  var dsNguoi = Object.keys(nguoi);
  var soNgay = r ? Math.round((new Date(r[1]) - new Date(r[0])) / 86400000) + 1 : null;

  var dai = '<div class="tl-dai">'
    + '<span class="tl-dai-dau">' + ic('pie', 22) + '</span>'
    + '<b>Không gian Task Pro</b>'
    + '<span class="tl-dai-cac">'
    +   (r ? '<span class="tl-vien"><i class="ico ico-mo">' + ic('lich',13) + '</i> '
            + dmy(r[0]) + ' → ' + dmy(r[1]) + '</span>' : '')
    +   (soNgay ? '<span class="tl-vien"><i class="ico ico-mo">' + ic('dongho',13) + '</i> '
            + soNgay + ' ngày</span>' : '')
    +   '<span class="tl-vien"><i class="ico ico-mo">' + ic('bang',13) + '</i> '
    +     list.length + ' việc</span>'
    + '</span>'
    + '<span class="tl-chong">' + dsNguoi.slice(0, 4).map(function(n){ return avatarHtml(n); }).join('')
    +   (dsNguoi.length > 4 ? '<span class="tl-them">' + (dsNguoi.length - 4) + '+</span>' : '')
    + '</span></div>';

  /* ---------- Việc cần tập trung ---------- */
  var UU = { 'Khẩn cấp':0, 'Cao':1, 'Trung bình':2, 'Thấp':3 };
  var cuaToi = list.filter(function(t){
    return t.PhuTrach === toi && t.TrangThai !== 'Hoàn thành'; });
  var tamNgam = (cuaToi.length ? cuaToi : list.filter(function(t){ return t.TrangThai !== 'Hoàn thành'; }))
    .slice().sort(function(a, b){
      var ua = UU[a.MucDo] === undefined ? 9 : UU[a.MucDo];
      var ub = UU[b.MucDo] === undefined ? 9 : UU[b.MucDo];
      if (ua !== ub) return ua - ub;
      return String(a.HanChot || '9999').localeCompare(String(b.HanChot || '9999'));
    })[0];

  var oNgam = '<div class="card tl-ngam"><h3 class="tl-h3">Việc cần tập trung'
    + '<span class="tl-nhan">' + (cuaToi.length ? 'Của bạn' : 'Toàn nhóm') + '</span></h3>'
    + (tamNgam
      ? '<button class="tl-ngam-o" onclick="openTaskForm(\'' + tamNgam.ID + '\')">'
        + '<span class="tl-ngam-ico">' + ic('tick', 17) + '</span>'
        + '<span class="tl-ngam-ten">' + esc(tamNgam.TenCongViec) + '</span>'
        + '<span class="tl-ngam-mui">›</span></button>'
        + '<div class="tl-ngam-than">'
        +   '<b>Vì sao việc này</b>'
        +   '<p>' + (UU[tamNgam.MucDo] <= 1
              ? 'Mức ưu tiên ' + esc(String(tamNgam.MucDo).toLowerCase()) + ' và '
              : 'Hạn gần nhất trong số việc chưa xong, ')
        +     (isOverdue(tamNgam)
              ? 'đã quá hạn ' + Math.max(1, Math.round((new Date(today()) - new Date(tamNgam.HanChot)) / 86400000)) + ' ngày.'
              : 'hạn chót ' + dmy(tamNgam.HanChot) + '.') + '</p>'
        +   '<div class="tl-chip-hang">'
        +     chip(tamNgam.MucDo, MAU_MD[tamNgam.MucDo] || '#94a3b8')
        +     '<span class="tl-vien">' + esc(tamNgam.TrangThai) + '</span>'
        +     '<span class="tl-vien">Hạn ' + dmy(tamNgam.HanChot) + '</span>'
        +   '</div></div>'
      : '<p class="muted">Không còn việc nào đang mở trong bộ lọc này.</p>')
    + '</div>';

  /* ---------- Việc gần đây ---------- */
  var ganDay = list.slice().sort(function(a, b){
    return String(b.NgayCapNhat || '').localeCompare(String(a.NgayCapNhat || '')); }).slice(0, 2);
  var oGanDay = '<div class="tl-khoi"><h3 class="tl-h3">Việc vừa động tới</h3>'
    + (ganDay.length
      ? '<div class="tl-doi">' + ganDay.map(function(t, i){
          var p = Number(t.TienDo) || 0;
          return '<button class="tl-o-viec" onclick="openTaskForm(\'' + t.ID + '\')">'
            + '<span class="tl-o-ico' + (i ? ' den' : '') + '">' + ic(i ? 'tick' : 'pie', 18) + '</span>'
            + '<span class="tl-o-ten">' + esc(t.TenCongViec) + '</span>'
            + '<span class="tl-thanh' + (p >= 100 ? ' xong' : '') + '">'
            +   '<i style="width:' + p + '%"></i><em>' + p + '%</em></span>'
            + '</button>';
        }).join('') + '</div>'
      : '<p class="muted">Chưa có việc nào.</p>')
    + '</div>';

  /* ---------- Nhịp tuần ---------- */
  var THU = ['T2','T3','T4','T5','T6','T7','CN'];
  var giao = [0,0,0,0,0,0,0], chot = [0,0,0,0,0,0,0];
  list.forEach(function(t){
    var a = String(t.NgayBatDau || '').slice(0, 10);
    var b = String(t.NgayHoanThanh || '').slice(0, 10);
    if (a) { var i = (new Date(a + 'T00:00:00').getDay() + 6) % 7; giao[i]++; }
    if (b) { var j = (new Date(b + 'T00:00:00').getDay() + 6) % 7; chot[j]++; }
  });
  var tongChot = chot.reduce(function(x, y){ return x + y; }, 0);
  var manhNhat = chot.indexOf(Math.max.apply(null, chot));
  var oTuan = '<div class="tl-khoi"><h3 class="tl-h3">Nhịp việc trong tuần</h3>'
    + '<div class="card tl-tuan">'
    +   '<div class="tl-tuan-dau"><b>' + tongChot + '</b><span>việc đã chốt</span>'
    +     '<span class="tl-nay">' + (tongChot ? THU[manhNhat] + ' mạnh nhất' : 'chưa có') + '</span></div>'
    +   duongTuan(chot, giao, THU)
    +   '<div class="tl-chu"><span class="cham xanh"></span>Đã chốt'
    +     '<span class="cham cam"></span>Bắt đầu</div>'
    + '</div></div>';

  /* ---------- Tin nhắn nhóm ---------- */
  var phong = (S.rooms || []).filter(function(p){ return p.tinCuoi; }).slice(0, 3);
  var oTin = '<div class="tl-khoi"><h3 class="tl-h3">Tin nhắn nhóm</h3>'
    + (phong.length
      ? '<div class="tl-tin">' + phong.map(function(p){
          var ten = String(p.tinCuoi).split(':')[0];
          var noi = String(p.tinCuoi).slice(ten.length + 1).trim();
          return '<button class="tl-tin-o" onclick="setView(\'chat\')">'
            + avatarHtml(ten)
            + '<span class="tl-tin-tt"><b>' + esc(p.Ten) + '</b><small>' + esc(noi || '—') + '</small></span>'
            + '<span class="tl-tin-gio">' + esc(String(p.thoiGianCuoi).slice(11, 16)) + '</span>'
            + (p.chuaDoc ? '<span class="tl-tin-dem">' + p.chuaDoc + '</span>' : '')
            + '</button>';
        }).join('') + '</div>'
      : '<div class="card"><p class="muted" style="margin:0">Chưa có tin nhắn nào.</p></div>')
    + '</div>';

  /* ---------- Hôm nay · Sắp tới · Nhận định ---------- */
  var hn = today();
  var homNay = list.filter(function(t){ return t.TrangThai !== 'Hoàn thành' && t.HanChot === hn; }).slice(0, 4);
  var sapToi = list.filter(function(t){ return t.TrangThai !== 'Hoàn thành' && (t.HanChot || '') > hn; })
    .sort(function(a, b){ return String(a.HanChot).localeCompare(String(b.HanChot)); }).slice(0, 4);

  var quaHan = list.filter(isOverdue);
  var nhanDinh;
  if (quaHan.length){
    var ai = {};
    quaHan.forEach(function(t){ ai[t.PhuTrach || '(trống)'] = (ai[t.PhuTrach || '(trống)'] || 0) + 1; });
    var top = Object.keys(ai).sort(function(a, b){ return ai[b] - ai[a]; })[0];
    nhanDinh = 'Có ' + quaHan.length + ' việc quá hạn, nhiều nhất ở ' + esc(top)
      + ' với ' + ai[top] + ' việc. Nên rà lại nhóm này trước.';
  } else if (tongChot && manhNhat >= 0){
    nhanDinh = 'Việc được chốt nhiều nhất vào ' + THU[manhNhat]
      + '. Xếp các việc khó vào ngày đó thường về đích đúng hạn hơn.';
  } else {
    nhanDinh = 'Chưa đủ dữ liệu trong kỳ này để rút ra nhận xét. Hãy nới bộ lọc thời gian.';
  }

  var dong = function(t, hienHan){
    return '<button class="tl-dong" onclick="openTaskForm(\'' + t.ID + '\')">'
      + '<span class="tl-cham" style="background:' + (MAU_TT[t.TrangThai] || '#94a3b8') + '"></span>'
      + '<span class="tl-dong-ten' + (t.TrangThai === 'Hoàn thành' ? ' xong' : '') + '">'
      +   esc(t.TenCongViec) + '</span>'
      + (hienHan
          ? '<span class="tl-dong-han' + (isOverdue(t) ? ' tre' : '') + '">' + dmy(t.HanChot) + '</span>'
          : chip(t.MucDo, MAU_MD[t.MucDo] || '#94a3b8'))
      + '</button>';
  };

  var oDuoi = '<div class="tl-ba">'
    + '<div class="card"><h3 class="tl-h3">Hôm nay</h3>'
    +   (homNay.length ? homNay.map(function(t){ return dong(t, false); }).join('')
                       : '<p class="muted">Hôm nay không có việc nào đến hạn.</p>') + '</div>'
    + '<div class="card"><h3 class="tl-h3">Sắp tới</h3>'
    +   (sapToi.length ? sapToi.map(function(t){ return dong(t, true); }).join('')
                       : '<p class="muted">Không có việc nào sắp đến hạn.</p>') + '</div>'
    + '<div class="card tl-nhan-dinh"><h3 class="tl-h3">'
    +   '<span class="tl-ngam-ico">' + ic('pie', 16) + '</span> Nhận định</h3>'
    +   '<p>' + nhanDinh + '</p>'
    +   '<div class="tl-chip-hang"><span class="tl-vien manh">Tính từ ' + list.length + ' việc</span>'
    +     '<span class="tl-vien">' + esc(nhanThoiGian(S.filter.thoiGian || 'all')) + '</span></div>'
    + '</div></div>';

  /* ---------- Ghép ---------- */
  return dai
    + '<div class="tl-khung">'
    +   '<div class="tl-trai">'
    +     '<div class="tl-do">' + theDo.map(function(k){
            var so = String(k[1]), hau = '';
            var m = so.match(/^(-?[\d.]+)(.*)$/);
            return '<div class="card tl-do-o" style="--i:' + k[7] + '">'
              + '<div class="tl-do-dau"><span class="tl-do-ico">' + k[4] + '</span>' + esc(k[0]) + '</div>'
              + '<div class="tl-do-than">'
              +   '<div><div class="tl-do-nho">' + esc(k[6]) + '</div>'
              +     '<div class="tl-do-so dem-len"'
              +       (m ? ' data-dem="' + m[1] + '" data-hau="' + esc(m[2]) + '"' : '')
              +     '>' + esc(so) + '</div>' + k[5] + '</div>'
              +   cungDo(k[2], k[3])
              + '</div></div>';
          }).join('') + '</div>'
    +     '<div class="tl-hai">'
    +       '<div class="card"><h3 class="tl-h3">Việc chốt theo tháng'
    +         '<span class="tl-nhan">8 tháng gần nhất</span></h3>'
    +         cotThang(viecTheoThang(S.tasks, 8)) + '</div>'
    +       oNgam
    +     '</div>'
    +     oDuoi
    +   '</div>'
    +   '<div class="tl-phai-cot">' + oGanDay + oTuan + oTin + '</div>'
    + '</div>';
}

/* ============ 2. THỐNG KÊ & KPI ============ */
function viewStats(){
  var list = filtered(), users = {};
  list.forEach(function(t){
    var k = t.PhuTrach || '(trống)';
    if (!users[k]) users[k] = {ten:k, tong:0, ht:0, dl:0, cl:0, qh:0, dungHan:0};
    var r = users[k]; r.tong++;
    if (t.TrangThai==='Hoàn thành'){ r.ht++; if(!t.HanChot||!t.NgayHoanThanh||t.NgayHoanThanh<=t.HanChot) r.dungHan++; }
    else if (t.TrangThai==='Đang làm') r.dl++; else r.cl++;
    if (isOverdue(t)) r.qh++;
  });
  var rows = Object.keys(users).map(function(k){return users[k];});
  var kpi = tinhKPI(S.kpiKy || 'thang');

  function bp(p, color){ return '<span class="bar" style="display:inline-block;width:70px;vertical-align:middle">'
    + '<i style="width:'+p+'%;background:'+(color||'var(--info)')+'"></i></span> '+p+'%'; }

  var lv = {};
  list.forEach(function(t){ var k=t.LinhVuc||'Chưa phân loại';
    if(!lv[k]) lv[k]={ten:k,tong:0,ht:0,dl:0,cl:0,qh:0};
    lv[k].tong++; if(t.TrangThai==='Hoàn thành')lv[k].ht++; else if(t.TrangThai==='Đang làm')lv[k].dl++; else lv[k].cl++;
    if(isOverdue(t))lv[k].qh++; });

  return statusTabs(list)
  + '<div class="grid g2">'
  + '<div class="card"><h3>👤 Báo cáo theo phụ trách</h3><div class="scroll-x"><table>'
  +   '<tr><th>Phụ trách</th><th>Tổng</th><th>Hoàn thành</th><th>Đang làm</th><th>Cần làm</th><th>Quá hạn</th><th>Tỷ lệ HT</th><th>Đúng hạn</th></tr>'
  +   rows.map(function(r){
        return '<tr><td>'+avatarHtml(r.ten)+' '+esc(r.ten)+'</td><td>'+r.tong+'</td>'
             + '<td style="color:var(--ok)">'+r.ht+'</td><td style="color:var(--info)">'+r.dl+'</td>'
             + '<td style="color:var(--warn)">'+r.cl+'</td><td style="color:var(--danger)">'+r.qh+'</td>'
             + '<td>'+bp(r.tong?Math.round(r.ht/r.tong*100):0)+'</td>'
             + '<td>'+(r.ht?bp(Math.round(r.dungHan/r.ht*100),'var(--ok)'):'-')+'</td></tr>';
      }).join('') + '</table></div></div>'

  + '<div class="card"><h3>🏆 KPI hoàn thành công việc (%)</h3>'
  +   '<div class="kpi-dieu">' + nutKy()
  +     '<button class="btn sm" onclick="xuatKPI()" title="Tải file CSV mở bằng Excel">⬇ Xuất CSV</button>'
  +   '</div>'
  +   '<p class="muted small">KPI = số việc đã hoàn thành / số việc được giao trong kỳ × 100%. '
  +   'Tính theo <b>hạn chót</b> của công việc, và theo đúng bộ lọc đang đặt ở đầu trang. '
  +   'Riêng tab trạng thái thì không áp vào đây, vì KPI cần cả việc xong lẫn chưa xong.</p>'
  +   (kpi.dong.length
      ? '<div class="scroll-x"><table>'
        + '<tr><th>Phụ trách</th><th>Bộ phận</th><th>' + esc(kpi.tenKy) + '</th>'
        + '<th>Được giao</th><th>Đã HT</th><th>Chưa HT</th><th>Quá hạn</th><th>KPI</th></tr>'
        + kpi.dong.map(function(r){
            return '<tr><td>'+avatarHtml(r.ten)+' '+esc(r.ten)+'</td>'
              + '<td class="small muted">'+esc(r.boPhan||'—')+'</td>'
              + '<td class="mono-so">'+esc(r.nhan)+'</td>'
              + '<td class="mono-so">'+r.giao+'</td>'
              + '<td class="mono-so" style="color:var(--ok)">'+r.ht+'</td>'
              + '<td class="mono-so" style="color:var(--warn)">'+(r.giao-r.ht)+'</td>'
              + '<td class="mono-so" style="color:var(--danger)">'+(r.qh||'—')+'</td>'
              + '<td>'+bp(r.kpi, r.kpi>=80?'var(--ok)':r.kpi>=50?'var(--warn)':'var(--danger)')+'</td></tr>';
          }).join('')
        + '<tr class="bc-dam"><td colspan="3"><b>Tổng cộng</b></td>'
        +   '<td class="mono-so"><b>'+kpi.tong.giao+'</b></td>'
        +   '<td class="mono-so"><b>'+kpi.tong.ht+'</b></td>'
        +   '<td class="mono-so"><b>'+(kpi.tong.giao-kpi.tong.ht)+'</b></td>'
        +   '<td class="mono-so"><b>'+(kpi.tong.qh||'—')+'</b></td>'
        +   '<td><b>'+bp(kpi.tong.kpi)+'</b></td></tr>'
        + '</table></div>'
      : '<p class="muted">Bộ lọc hiện tại không còn công việc nào có hạn chót để tính KPI.</p>')
  + '</div>'

  + '<div class="card"><h3>🗂 Báo cáo theo lĩnh vực</h3><div class="scroll-x"><table>'
  +   '<tr><th>Lĩnh vực</th><th>Tổng</th><th>Hoàn thành</th><th>Đang làm</th><th>Cần làm</th><th>Quá hạn</th><th>Tỷ lệ HT</th></tr>'
  +   Object.keys(lv).map(function(k){ var r=lv[k];
        return '<tr><td>'+esc(r.ten)+'</td><td>'+r.tong+'</td><td>'+r.ht+'</td><td>'+r.dl+'</td><td>'+r.cl+'</td>'
             + '<td style="color:var(--danger)">'+r.qh+'</td><td>'+bp(r.tong?Math.round(r.ht/r.tong*100):0)+'</td></tr>';
      }).join('') + '</table></div></div>'

  + '<div class="card"><h3>🔥 Công việc tồn đọng cần ưu tiên</h3><div class="scroll-x"><table>'
  +   '<tr><th>Công việc</th><th>Phụ trách</th><th>Hạn chót</th><th>Ưu tiên</th><th>Trạng thái</th></tr>'
  +   list.filter(function(t){return t.TrangThai!=='Hoàn thành';})
        .sort(function(a,b){return String(a.HanChot).localeCompare(String(b.HanChot));}).slice(0,10)
        .map(function(t){
          return '<tr onclick="openTaskForm(\''+t.ID+'\')" style="cursor:pointer"><td>'+esc(t.TenCongViec)+'</td>'
               + '<td>'+avatarHtml(t.PhuTrach)+' '+esc(t.PhuTrach)+'</td>'
               + '<td'+(isOverdue(t)?' style="color:var(--danger);font-weight:600"':'')+'>'+dmy(t.HanChot)+'</td>'
               + '<td>'+chip(t.MucDo, MAU_MD[t.MucDo]||'#94a3b8')+'</td>'
               + '<td>'+chip(t.TrangThai, MAU_TT[t.TrangThai])+'</td></tr>';
        }).join('') + '</table></div></div>'
  + '</div>';
}

/* ---------- KPI theo tuần / tháng / quý / năm ---------- */

var TEN_KY = { tuan:'Tuần', thang:'Tháng', quy:'Quý', nam:'Năm' };

function nutKy(){
  return ['tuan','thang','quy','nam'].map(function(k){
    return '<button class="btn sm' + ((S.kpiKy || 'thang') === k ? ' primary' : '') + '"'
      + ' onclick="doiKyKPI(\'' + k + '\')">' + TEN_KY[k] + '</button>';
  }).join('');
}
function doiKyKPI(k){ S.kpiKy = k; render(); }

/** Số tuần theo chuẩn ISO 8601: tuần chứa ngày thứ Năm thuộc về năm đó. */
function tuanISO(d){
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));      // dời tới thứ Năm
  var dauNam = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  var so = Math.ceil(((t - dauNam) / 86400000 + 1) / 7);
  return { nam: t.getUTCFullYear(), tuan: so };
}

/** Quy một ngày về kỳ: trả mã để sắp xếp và nhãn để hiển thị. */
function kyCua(ngay, loai){
  var s = String(ngay || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  var nam = s.slice(0, 4), thang = s.slice(5, 7);

  if (loai === 'nam')  return { ma: nam, nhan: 'Năm ' + nam };
  if (loai === 'quy'){
    var q = Math.floor((Number(thang) - 1) / 3) + 1;
    return { ma: nam + '-Q' + q, nhan: 'Quý ' + q + '/' + nam };
  }
  if (loai === 'tuan'){
    var p = s.split('-');
    var w = tuanISO(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    var ss = ('0' + w.tuan).slice(-2);
    return { ma: w.nam + '-W' + ss, nhan: 'Tuần ' + w.tuan + '/' + w.nam };
  }
  return { ma: nam + '-' + thang, nhan: 'Tháng ' + Number(thang) + '/' + nam };
}

/** Gộp KPI theo (phụ trách × kỳ). Bỏ qua tab trạng thái, giữ nguyên bộ lọc còn lại. */
function tinhKPI(loai){
  var list = filtered(true);
  var m = {}, tong = { giao:0, ht:0, qh:0 };

  list.forEach(function(t){
    var k = kyCua(t.HanChot || t.NgayBatDau, loai);
    if (!k) return;                                  // không có mốc thời gian thì không xếp được kỳ
    var ten = t.PhuTrach || '(trống)';
    var khoa = k.ma + '|' + ten;
    if (!m[khoa]) m[khoa] = { ten:ten, ma:k.ma, nhan:k.nhan, giao:0, ht:0, qh:0,
                              boPhan: (S.users.filter(function(u){ return u.Ten === ten; })[0] || {}).BoPhan || '' };
    var r = m[khoa];
    r.giao++; tong.giao++;
    if (t.TrangThai === 'Hoàn thành'){ r.ht++; tong.ht++; }
    else if (isOverdue(t)){ r.qh++; tong.qh++; }
  });

  var dong = Object.keys(m).map(function(k){
    var r = m[k];
    r.kpi = r.giao ? Math.round(r.ht / r.giao * 100) : 0;
    return r;
  }).sort(function(a, b){
    if (a.ma !== b.ma) return a.ma < b.ma ? 1 : -1;  // kỳ mới nhất lên trước
    return b.kpi - a.kpi;
  });

  tong.kpi = tong.giao ? Math.round(tong.ht / tong.giao * 100) : 0;
  return { dong: dong, tong: tong, tenKy: TEN_KY[loai] || 'Kỳ', loai: loai };
}

/** Mô tả bộ lọc đang đặt, để ghi vào đầu file cho người nhận hiểu số ở đâu ra */
function moTaBoLoc(){
  var f = S.filter, ra = [];
  if (f.phuTrach) ra.push('Phụ trách: ' + f.phuTrach);
  if (f.boPhan)   ra.push('Bộ phận: ' + f.boPhan);
  if (f.mucDo)    ra.push('Mức độ: ' + f.mucDo);
  if (f.phamVi)   ra.push('Phạm vi: ' + f.phamVi);
  if (f.mau)      ra.push('Có gắn nhãn màu');
  if (f.cuaToi)   ra.push('Chỉ việc của tôi');
  if (f.timKiem)  ra.push('Từ khoá: ' + f.timKiem);
  if (f.thoiGian && f.thoiGian !== 'all') ra.push('Khoảng thời gian: ' + nhanThoiGian(f.thoiGian));
  return ra.length ? ra.join(' · ') : 'Không đặt bộ lọc (toàn bộ dữ liệu bạn được xem)';
}
function nhanThoiGian(k){
  return { all:'Toàn bộ thời gian', today:'Hôm nay', week:'Tuần này', lastweek:'Tuần trước',
           month:'Tháng này', lastmonth:'Tháng trước',
           next7:'7 ngày tới', next30:'30 ngày tới', overdue:'Đang quá hạn' }[k] || k;
}

function xuatKPI(){
  var loai = S.kpiKy || 'thang';
  var kpi = tinhKPI(loai);
  if (!kpi.dong.length){ toast('Bộ lọc hiện tại không có số liệu để xuất'); return; }

  var hang = [];
  hang.push(['BÁO CÁO KPI HOÀN THÀNH CÔNG VIỆC THEO ' + TEN_KY[loai].toUpperCase()]);
  hang.push(['Bộ lọc', moTaBoLoc()]);
  hang.push(['Người xuất', S.me.Ten, 'Thời điểm', gioHienTai()]);
  hang.push(['Cách tính', 'KPI = Đã hoàn thành / Được giao × 100%, xếp kỳ theo hạn chót của công việc']);
  hang.push([]);
  hang.push(['Stt', TEN_KY[loai], 'Phụ trách', 'Bộ phận',
             'Được giao', 'Đã hoàn thành', 'Chưa hoàn thành', 'Quá hạn', 'KPI (%)']);
  kpi.dong.forEach(function(r, i){
    hang.push([i + 1, r.nhan, r.ten, r.boPhan,
               r.giao, r.ht, r.giao - r.ht, r.qh, r.kpi]);
  });
  hang.push([]);
  hang.push(['', 'TỔNG CỘNG', '', '',
             kpi.tong.giao, kpi.tong.ht, kpi.tong.giao - kpi.tong.ht,
             kpi.tong.qh, kpi.tong.kpi]);

  var csv = hang.map(function(h){ return h.map(oCSV).join(';'); }).join('\r\n');
  var ten = 'KPI-' + loai + '-' + today() + '.csv';
  taiBlobUrl_(URL.createObjectURL(
    new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })), ten);
  toast('Đã tải ' + ten + ' — mở bằng Excel');
}

/* ============ 3. SƠ ĐỒ GANTT ============ */
var ganttStart = null;
function viewGantt(){
  var list = filtered().slice().sort(function(a,b){return String(a.NgayBatDau).localeCompare(String(b.NgayBatDau));});
  var DAYS = 35, W = 34;
  if (!ganttStart){
    var d = new Date(); ganttStart = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  var s0 = new Date(ganttStart);
  function ymd(d){ return lymd(d); }
  function idx(dateStr){
    if (!dateStr) return null;
    return Math.round((new Date(dateStr+'T00:00:00') - new Date(ymd(s0)+'T00:00:00')) / 86400000);
  }
  var heads = '', tdIdx = idx(today());
  for (var i=0;i<DAYS;i++){
    var d = new Date(s0.getTime()+i*86400000), dow = d.getDay();
    var cls = 'g-day' + ((dow===0||dow===6)?' weekend':'') + (i===tdIdx?' today':'');
    heads += '<div class="'+cls+'"><b>'+d.getDate()+'</b><br>'+['CN','T2','T3','T4','T5','T6','T7'][dow]+'</div>';
  }
  var rowsLeft = list.map(function(t){
    var sub = subOf(t.ID), doneSub = sub.filter(function(s){return s.HoanThanh;}).length;
    return '<div class="g-row" onclick="openTaskForm(\''+t.ID+'\')">'
      + chip(t.TrangThai, MAU_TT[t.TrangThai])
      + '<span style="overflow:hidden;text-overflow:ellipsis">'+esc(t.TenCongViec)+'</span>'
      + (sub.length?'<span class="chip" style="background:var(--surface-2)">'+doneSub+'/'+sub.length+'</span>':'')
      + '</div>';
  }).join('');

  var bars = list.map(function(t){
    var a = idx(t.NgayBatDau), b = idx(t.HanChot);
    if (a===null||b===null) return '<div class="g-line"></div>';
    var from = Math.max(0,a), to = Math.min(DAYS-1,b);
    if (b<0 || a>DAYS-1) return '<div class="g-line"></div>';
    var color = isOverdue(t) ? '#ef4444' : MAU_TT[t.TrangThai];
    return '<div class="g-line"><div class="g-bar" style="left:'+(from*W+2)+'px;width:'+((to-from+1)*W-6)+'px;background:'+color+'"'
      + ' onclick="openTaskForm(\''+t.ID+'\')" title="'+esc(t.TenCongViec)+' | '+t.PhuTrach+' | '+dmy(t.NgayBatDau)+' - '+dmy(t.HanChot)+' | '+t.TienDo+'%">'
      + '● '+esc(t.TenCongViec)+'</div></div>';
  }).join('');

  return statusTabs(list)
  + '<div class="card" style="padding:12px">'
  + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">'
  +   '<h3 style="margin:0">☰ Sơ đồ Gantt</h3>'
  +   '<button class="btn sm" onclick="ganttStart=null;render()">⊙ Hôm nay</button>'
  +   '<button class="btn sm" onclick="ganttMove(-14)">‹</button>'
  +   '<span class="small muted">Bắt đầu: '+ymd(s0)+'</span>'
  +   '<button class="btn sm" onclick="ganttMove(14)">›</button>'
  + '</div>'
  + '<div class="gantt"><div class="g-left"><div class="g-head">Công việc</div>'+rowsLeft+'</div>'
  + '<div class="g-right"><div style="min-width:'+(DAYS*W)+'px">'
  +   '<div class="g-days">'+heads+'</div>'
  +   '<div class="g-body">'+bars
  +   (tdIdx>=0&&tdIdx<DAYS ? '<div class="g-today-line" style="left:'+(tdIdx*W+W/2)+'px"></div>' : '')
  +   '</div></div></div></div></div>';
}
function ganttMove(n){ ganttStart = new Date(ganttStart.getTime()+n*86400000); render(); }

/* ============ 4. KANBAN ============ */
/** Trên điện thoại 4 cột Kanban phải vuốt ngang; đổi thành một cột,
 *  chọn trạng thái bằng thanh tab ngang ở trên. Thẻ vẫn kéo thả được
 *  trên bản máy tính, còn ở đây đổi trạng thái bằng ô chọn trong thẻ. */
var kanCot = null;

function datKanCot(tt){ kanCot = tt; render(); }

function viewKanbanMobile(list){
  if (!kanCot || TRANG_THAI.indexOf(kanCot) < 0) kanCot = TRANG_THAI[0];
  var tab = '<div class="kan-tab">' + TRANG_THAI.map(function(tt){
    var n = list.filter(function(t){ return t.TrangThai === tt; }).length;
    return '<button class="' + (tt===kanCot?'chon':'') + '" onclick="datKanCot(\'' + tt + '\')">'
      + esc(tt) + '<span class="dem">' + n + '</span></button>';
  }).join('') + '</div>';
  return tab + viewListMobile(list.filter(function(t){ return t.TrangThai === kanCot; }));
}

function viewKanban(){
  var list = filtered();
  if (laDienThoai()) return viewKanbanMobile(list);
  return '<div class="kanban">' + TRANG_THAI.map(function(tt){
    var col = list.filter(function(t){return t.TrangThai===tt;});
    return '<div class="kcol" data-status="'+tt+'"><h4><span>'+chip(tt,MAU_TT[tt])+'</span><span class="muted">'+col.length+'</span></h4>'
      + col.map(function(t){
          var sub = subOf(t.ID), d = sub.filter(function(s){return s.HoanThanh;}).length;
          var keo = coTheDoiTT(t);
          return '<div class="kcard'+(keo?'':' locked')+'" draggable="'+(keo?'true':'false')+'"'
            + ' data-id="'+t.ID+'" data-keo="'+(keo?'1':'0')+'" onclick="openTaskForm(\''+t.ID+'\')"'
            + ' title="'+(keo?'':'Không có quyền đổi trạng thái công việc này')+'"'
            + ' style="border-left-color:'+(MAU_MD[t.MucDo]||'#94a3b8')+'">'
            + (t.MauNhan ? '<span class="nhan-vach" style="background:'+esc(t.MauNhan)+'"></span>' : '')
            + '<b>'+(keo?'':'<i class="ico ico-mo" title="Không có quyền đổi trạng thái">'+ic('khoa',13)+'</i> ')+chamMau(t.MauNhan)+esc(t.TenCongViec)+'</b>'
            + '<div class="meta">'+avatarHtml(t.PhuTrach)+esc(t.PhuTrach)
            +   '<span'+(isOverdue(t)?' style="color:var(--danger);font-weight:600"':'')+'><i class="ico ico-mo">'+ic('lich',12)+'</i> '+dmy(t.HanChot)+'</span>'
            +   huyHieuPhamVi(t)
            +   (laToTrinh(t)
                  ? '<span class="chip chip-tt">'+iconToTrinh(13)+' '+esc(t.SoToTrinh)+'</span>'
                  + '<button class="the-in" title="In / Xuất PDF"'
                  + ' onclick="event.stopPropagation();xemToTrinh(\''+t.ID+'\')">'+ic('mayin',13)+'</button>'
                  : '')
            + '</div>'
            + '<div class="bar" style="margin-top:6px"><i style="width:'+t.TienDo+'%;background:'+MAU_TT[t.TrangThai]+'"></i></div>'
            + '<div class="kfoot">'
            +   '<span title="Bình luận"><i class="ico ico-mo">'+ic('chat',12)+'</i> '+(S.soBinhLuan[t.ID]||0)+'</span>'
            +   (sub.length?'<span title="Công việc con"><i class="ico ico-mo">'+ic('tick',12)+'</i> '+d+'/'+sub.length+'</span>':'')
            +   '<span class="kfoot-td" title="Tiến độ">'+(t.TienDo||0)+'%</span>'
            + '</div>'
            + '</div>';
        }).join('')
      + '</div>';
  }).join('') + '</div>';
}

function bindKanbanDnD(){
  var dragId = null;
  document.querySelectorAll('.kcard[data-keo="1"]').forEach(function(c){
    c.addEventListener('dragstart', function(e){ dragId = c.dataset.id; e.dataTransfer.effectAllowed='move'; });
  });
  document.querySelectorAll('.kcol').forEach(function(col){
    col.addEventListener('dragover', function(e){ e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', function(){ col.classList.remove('drag-over'); });
    col.addEventListener('drop', function(e){
      e.preventDefault(); col.classList.remove('drag-over');
      if (dragId) { quickStatus(dragId, col.dataset.status); dragId = null; }
    });
  });
}

/* ============ 5. DANH SÁCH ============ */

/** Trên điện thoại bảng 9 cột phải vuốt ngang mới đọc hết, nên đổi hẳn
 *  sang danh sách thẻ đọc dọc. Bản máy tính giữ nguyên bảng như cũ. */
function viewListMobile(list){
  if (!list.length) return '<div class="card"><div class="the-trong">Không có công việc phù hợp bộ lọc</div></div>';
  return '<div class="the-ds">' + list.map(function(t){
    var sua = coTheDoiTT(t);
    return '<div class="the-o" style="border-left-color:' + (MAU_MD[t.MucDo]||'#94a3b8') + '"'
      + ' onclick="openTaskForm(\'' + t.ID + '\')">'
      + '<div class="the-dau"><b>' + chamMau(t.MauNhan) + esc(t.TenCongViec) + '</b>'
      +   chip(t.MucDo, MAU_MD[t.MucDo]||'#94a3b8') + '</div>'
      + '<div class="the-hang">' + avatarHtml(t.PhuTrach) + esc(t.PhuTrach)
      +   (t.BoPhan ? '<span class="nhan">' + esc(t.BoPhan) + '</span>' : '')
      +   huyHieuPhamVi(t) + '</div>'
      + '<div class="the-hang">'
      +   '<span' + (isOverdue(t) ? ' style="color:var(--danger);font-weight:600"' : '') + '>'
      +     '<i class="ico ico-mo">' + ic('lich',12) + '</i> ' + dmy(t.NgayBatDau) + ' → ' + dmy(t.HanChot) + '</span>'
      +   '<span class="nhan"><i class="ico ico-mo">' + ic('chat',12) + '</i> ' + (S.soBinhLuan[t.ID]||0) + '</span>'
      + '</div>'
      + '<div class="bar"><i style="width:' + t.TienDo + '%;background:' + MAU_TT[t.TrangThai] + '"></i></div>'
      + '<div class="the-chan" onclick="event.stopPropagation()">'
      +   '<select class="chip" ' + (sua ? '' : 'disabled title="Không có quyền đổi trạng thái"')
      +     ' onchange="quickStatus(\'' + t.ID + '\',this.value)">'
      +     TRANG_THAI.map(function(x){ return '<option' + (x===t.TrangThai?' selected':'') + '>' + x + '</option>'; }).join('')
      +   '</select>'
      +   '<span class="day nhan">' + (t.TienDo||0) + '%</span>'
      + '</div>'
      + '</div>';
  }).join('') + '</div>';
}

function viewList(){
  var list = filtered();
  if (laDienThoai()) return statusTabs(list) + viewListMobile(list);
  return statusTabs(list) + '<div class="card"><div class="scroll-x"><table>'
  + '<tr><th>Công việc</th><th>Phụ trách</th><th>Bộ phận</th><th>Ưu tiên</th><th>Trạng thái</th>'
  + '<th>Bắt đầu</th><th>Hạn chót</th><th>Tiến độ</th><th></th></tr>'
  + (list.length ? list.map(function(t){
      return '<tr><td><b>'+chamMau(t.MauNhan)+esc(t.TenCongViec)+'</b>'+huyHieuPhamVi(t)
        + (S.soBinhLuan[t.ID]?' <span class="cmt-badge">💬 '+S.soBinhLuan[t.ID]+'</span>':'')+'</td>'
        + '<td>'+avatarHtml(t.PhuTrach)+' '+esc(t.PhuTrach)+'</td><td>'+esc(t.BoPhan)+'</td>'
        + '<td>'+chip(t.MucDo, MAU_MD[t.MucDo]||'#94a3b8')+'</td>'
        + '<td><select class="chip" '+(coTheDoiTT(t)?'':'disabled title="Không có quyền đổi trạng thái"')
        +   ' onchange="quickStatus(\''+t.ID+'\',this.value)" onclick="event.stopPropagation()">'
        +   TRANG_THAI.map(function(x){return '<option'+(x===t.TrangThai?' selected':'')+'>'+x+'</option>';}).join('')
        + '</select></td>'
        + '<td>'+dmy(t.NgayBatDau)+'</td>'
        + '<td'+(isOverdue(t)?' style="color:var(--danger);font-weight:600"':'')+'>'+dmy(t.HanChot)+'</td>'
        + '<td><span class="bar" style="display:inline-block;width:70px"><i style="width:'+t.TienDo+'%"></i></span> '+t.TienDo+'%</td>'
        + '<td><button class="btn sm" onclick="openTaskForm(\''+t.ID+'\')">✏️</button></td></tr>';
    }).join('') : '<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">Không có công việc phù hợp bộ lọc</td></tr>')
  + '</table></div></div>';
}

/* ============ 6. LỊCH TRÌNH ============ */
var calMonth = null;
function viewCalendar(){
  if (!calMonth) { var n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
  var y = calMonth.getFullYear(), m = calMonth.getMonth();
  var first = new Date(y, m, 1), startDow = (first.getDay()+6)%7;
  var list = filtered();
  var cells = '';
  for (var i=0;i<42;i++){
    var d = new Date(y, m, 1 - startDow + i);
    var ds = lymd(d);
    var evs = list.filter(function(t){ return t.NgayBatDau <= ds && ds <= t.HanChot; });
    cells += '<div class="cell'+(d.getMonth()!==m?' out':'')+(ds===today()?' today':'')+'">'
      + '<div class="d">'+d.getDate()+'</div>'
      + evs.slice(0,4).map(function(t){
          return '<div class="ev" style="background:'+(isOverdue(t)?'#ef4444':MAU_TT[t.TrangThai])+'"'
               + ' onclick="openTaskForm(\''+t.ID+'\')" title="'+esc(t.TenCongViec)+'">'+esc(t.TenCongViec)+'</div>';
        }).join('')
      + (evs.length>4 ? '<div class="small muted">+'+(evs.length-4)+' việc</div>' : '')
      + '</div>';
  }
  return '<div class="card">'
  + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'
  +   '<button class="btn sm" onclick="calMove(-1)">‹</button>'
  +   '<h3 style="margin:0">📅 Tháng '+(m+1)+'/'+y+'</h3>'
  +   '<button class="btn sm" onclick="calMove(1)">›</button>'
  +   '<button class="btn sm" onclick="calMonth=null;render()">Hôm nay</button>'
  + '</div>'
  + '<div class="scroll-x"><div class="cal">'
  + ['T2','T3','T4','T5','T6','T7','CN'].map(function(x){return '<div class="dow">'+x+'</div>';}).join('')
  + cells + '</div></div></div>';
}
function calMove(n){ calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+n, 1); render(); }

/* ============ 7. LỊCH SỬ ============ */
function viewHistory(){
  return '<div class="card"><h3>🕘 Lịch sử chỉnh sửa</h3><div id="hisBox">' + khungCho(4) + '</div></div>';
}
function loadHistory(){
  call('apiGetHistory', [S.token, null], function(rows){
    document.getElementById('hisBox').innerHTML = '<div class="scroll-x"><table>'
    + '<tr><th>Thời gian</th><th>Người thực hiện</th><th>Công việc</th><th>Hành động</th><th>Trường</th><th>Giá trị cũ</th><th>Giá trị mới</th></tr>'
    + rows.map(function(h){
        return '<tr><td class="small">'+esc(h.ThoiGian)+'</td><td>'+avatarHtml(h.NguoiThucHien)+' '+esc(h.NguoiThucHien)+'</td>'
          + '<td>'+esc(h.TenCongViec)+'</td><td>'+chip(h.HanhDong,'#3b82f6')+'</td><td class="small">'+esc(h.Truong)+'</td>'
          + '<td class="small muted">'+esc(h.GiaTriCu)+'</td><td class="small">'+esc(h.GiaTriMoi)+'</td></tr>';
      }).join('') + '</table></div>';
  });
}

/* ============ 8. NGƯỜI DÙNG ============ */
var TEN_VAI_TRO = {
  Admin:        'Admin — toàn quyền hệ thống',
  'Lãnh đạo':   'Lãnh đạo — xem toàn doanh nghiệp, phê duyệt',
  Manage:       'Quản lý — quản phòng ban',
  'Hành chính': 'Hành chính — xe, phòng họp, lịch',
  'Kiểm soát':  'Kiểm soát / Audit — chỉ đọc và xuất dữ liệu',
  User:         'Nhân viên',
  View:         'Người xem — chỉ đọc'
};
var TEN_PHAM_VI_DL = {
  DS01:'DS01 — Cá nhân',
  DS02:'DS02 — Được giao / được chia sẻ',
  DS03:'DS03 — Nhóm',
  DS04:'DS04 — Phòng ban',
  DS05:'DS05 — Đơn vị / Dự án',
  DS06:'DS06 — Toàn doanh nghiệp'
};

function viewUsers(){
  var M = [
    ['Admin','DS06','✔','✔','✔ Mọi người','✔ Mọi task','✔ Mọi task','✔','✔','✔ Mọi vai trò'],
    ['Lãnh đạo','DS06','✔','✔','✕','✔ Việc đang giữ','✔ Việc đang giữ','✔','✔','✕'],
    ['Quản lý','DS04','✔','✔','✔ Mọi người','✔ Việc đang giữ','✔ Việc đang giữ','✔','✔','✔ User, Người xem cùng phòng'],
    ['Hành chính','DS04','✔','✔','✔ Xe, phòng họp','✔ Việc đang giữ','✔ Việc đang giữ','✕','✔','✕'],
    ['Kiểm soát','DS04','✔','✕','✕','✕','✕','✕','✔','✕'],
    ['Nhân viên','DS02','✔','✔','Chỉ tự giao','✔ Việc đang giữ','✔ Việc đang giữ','✕','✕','✕'],
    ['Người xem','DS02','✔','✕','✕','✕','✕','✕','✕','✕']
  ];
  return '<div class="card"><h3>🛡 Ma trận phân quyền thao tác</h3>'
  + '<p class="muted small" style="margin:0 0 10px">Theo đề án phân quyền ngày 11/10/2026. '
  + 'Quyền <b>thao tác</b> và <b>phạm vi dữ liệu</b> được kiểm tra độc lập: có quyền sửa '
  + 'chưa chắc đã nhìn thấy bản ghi, và ngược lại.</p><div class="scroll-x"><table>'
  + '<tr><th>Vai trò</th><th>Phạm vi<br>mặc định</th><th>Xem</th><th>Tạo</th><th>Giao việc</th>'
  + '<th>Sửa</th><th>Xoá</th><th>Phê duyệt</th><th>Xuất dữ liệu</th><th>Tạo tài khoản</th></tr>'
  + M.map(function(r){ return '<tr>'+r.map(function(c,i){
      if (i === 0) return '<td><b>'+esc(c)+'</b></td>';
      if (i === 1) return '<td><b class="mono-so" title="'+esc(TEN_PHAM_VI_DL[c]||'')+'">'+esc(c)+'</b></td>';
      return '<td style="color:var('+(c.charAt(0)==='✔'?'--ok':'--text-muted')+')">'+esc(c)+'</td>';
    }).join('')+'</tr>'; }).join('')
  + '</table></div></div>'
  + '<p class="muted small" style="margin:10px 0 0">📌 <b>Việc đang giữ</b> nghĩa là bạn đang là người phụ trách. '
  + 'Chuyển việc cho người khác rồi thì chỉ còn xem và bình luận — kể cả người tạo và quản lý cùng phòng. '
  + 'Việc đã <b>Hoàn thành</b> thì chỉ người bấm Hoàn thành mới mở lại được.</p>'
  + '<p class="muted small" style="margin:8px 0 0">📌 <b>Không tự duyệt hồ sơ do mình lập.</b> '
  + 'Muốn duyệt thì phải Chuyển tiếp cho người có thẩm quyền. Riêng Admin giữ lối thoát để xử lý sai sót.</p>'
  + '<div class="scroll-x" style="margin-top:14px"><table>'
  + '<tr><th>Mã</th><th>Phạm vi dữ liệu</th><th>Nhìn thấy được gì</th></tr>'
  + [['DS01','Cá nhân','Công việc, lịch và hồ sơ của chính mình'],
     ['DS02','Được giao / chia sẻ','Thêm việc được giao, tham gia hoặc được chia sẻ'],
     ['DS03','Nhóm','Dữ liệu nhóm mình quản lý'],
     ['DS04','Phòng ban','Dữ liệu thuộc phòng ban được phân công'],
     ['DS05','Đơn vị / Dự án','Dữ liệu công ty thành viên hoặc dự án được giao'],
     ['DS06','Toàn doanh nghiệp','Toàn bộ, trừ bản ghi người khác đặt riêng tư là Cá nhân']
    ].map(function(r){ return '<tr><td><b class="mono-so">' + r[0] + '</b></td><td>' + esc(r[1])
      + '</td><td class="small">' + esc(r[2]) + '</td></tr>'; }).join('')
  + '</table></div></div>'
  + '<div class="card"><h3 style="justify-content:space-between">Quản lý người dùng'
  +   (vaiTroTaoDuoc().length
        ? '<button class="btn primary sm" onclick="openUserForm()">+ Thêm '
          + (S.me.VaiTro === 'Manage' ? 'nhân viên' : 'người dùng') + '</button>'
        : '<span class="muted small">Bạn không có quyền tạo tài khoản</span>')
  +   '</h3>'
  +   (S.me.VaiTro === 'Manage'
        ? '<p class="muted small">Bạn tạo và quản lý được tài khoản Nhân viên, Người xem thuộc phòng <b>'
          + esc(S.me.BoPhan) + '</b>.</p>' : '')
  +   '<div class="scroll-x"><table>'
  + '<tr><th>Tên</th><th>Vai trò</th><th>Phạm vi<br>dữ liệu</th><th>Bộ phận</th>'
  + '<th>Chức danh</th><th>Phân quyền</th><th>Lái xe</th><th>Thao tác</th></tr>'
  + S.users.map(function(u){
      return '<tr><td>'+avatarHtml(u.Ten)+' <b>'+esc(u.Ten)+'</b>'
        + '<div class="muted small">'+esc(u.ID)+'</div></td>'
        + '<td>'+chip(TEN_VAI_TRO[u.VaiTro] ? String(TEN_VAI_TRO[u.VaiTro]).split(' — ')[0] : u.VaiTro,
              mauVaiTro(u.VaiTro))+'</td>'
        + '<td><b class="mono-so" title="'+esc(TEN_PHAM_VI_DL[u.PhamViDuLieu]||'')+'">'
        +   esc(u.PhamViDuLieu||'—')+'</b></td>'
        + '<td>'+esc(u.BoPhan)+'</td>'
        + '<td class="small">'+esc(u.ChucDanh||'—')+'</td>'
        + '<td>'+esc(u.PhanQuyen)+'</td>'
        + '<td>'+(u.LaLaiXe?'Có':'—')+'</td>'
        + '<td>' + (coTheSuaUser(u)
            ? '<button class="btn sm" title="Sửa" onclick="openUserForm(\''+u.ID+'\')">✏️</button> '
            + '<button class="btn sm" title="Đặt lại mật khẩu" onclick="openResetPass(\''+u.ID+'\')">🔑</button> '
            + '<button class="btn sm" title="Xoá" onclick="delUser(\''+u.ID+'\')">🗑</button>'
            : '<span class="muted small">—</span>') + '</td></tr>';
    }).join('') + '</table></div></div>'
  + (['Admin','Kiểm soát'].indexOf(S.me.VaiTro) >= 0
      ? '<div class="card"><h3 style="justify-content:space-between">🛡 Nhật ký thay đổi quyền'
        + '<button class="btn sm" onclick="loadNhatKyQuyen()">Tải lại</button></h3>'
        + '<p class="muted small">Mọi thay đổi vai trò, phạm vi dữ liệu, bộ phận, trạng thái '
        + 'tài khoản và mật khẩu đều để lại dấu vết ở đây. Không ai xoá được.</p>'
        + '<div id="nkqBox" class="muted">Bấm <b>Tải lại</b> để xem.</div></div>'
      : '');
}

function loadNhatKyQuyen(){
  call('apiNhatKyQuyen', [S.token], function(r){
    var box = document.getElementById('nkqBox');
    if (!box) return;
    box.classList.remove('muted');
    if (!r || !r.ok){ box.innerHTML = '<p class="muted">'+esc(r&&r.msg||'Lỗi')+'</p>'; return; }
    if (!r.dong.length){ box.innerHTML = '<p class="muted">Chưa có thay đổi quyền nào.</p>'; return; }
    box.innerHTML = '<div class="scroll-x"><table>'
      + '<tr><th>Thời điểm</th><th>Người thực hiện</th><th>Tài khoản bị đổi</th>'
      + '<th>Hành động</th><th>Trường</th><th>Trước</th><th>Sau</th></tr>'
      + r.dong.map(function(d){
          return '<tr><td class="mono-so small">'+esc(String(d.ThoiGian).slice(0,16))+'</td>'
            + '<td>'+avatarHtml(d.NguoiThucHien)+' '+esc(d.NguoiThucHien)+'</td>'
            + '<td><b>'+esc(d.DoiTuong)+'</b></td>'
            + '<td>'+esc(d.HanhDong)+'</td>'
            + '<td class="small">'+esc(d.Truong||'—')+'</td>'
            + '<td class="small muted">'+esc(d.GiaTriCu||'—')+'</td>'
            + '<td class="small"><b>'+esc(d.GiaTriMoi||'—')+'</b></td></tr>';
        }).join('') + '</table></div>';
  });
}

function mauVaiTro(v){
  return {Admin:'#ef4444','Lãnh đạo':'#8b5cf6',Manage:'#f59e0b',
          'Hành chính':'#06b6d4','Kiểm soát':'#64748b',User:'#3b82f6',
          View:'#94a3b8'}[v] || '#3b82f6';
}

function openUserForm(id){
  var u = id ? S.users.filter(function(x){return x.ID===id;})[0] : null;
  var opt = function(l,v){ return l.map(function(x){return '<option'+(x===v?' selected':'')+'>'+x+'</option>';}).join(''); };
  openModal('<h3>'+(u?'Sửa người dùng':'Thêm người dùng')+'</h3><div class="form-grid">'
  + '<div class="field"><label>Tên đăng nhập *</label><input id="uTen" value="'+esc(u?u.Ten:'')+'"></div>'
  + '<div class="field"><label>Email (nhận cảnh báo)</label><input id="uEmail" type="email" value="'+esc(u&&u.Email?u.Email:'')+'"></div>'
  + '<div class="field"><label>Vai trò</label><select id="uVT">'
  +   (function(){
        var ds = vaiTroTaoDuoc();
        if (u && ds.indexOf(u.VaiTro) < 0) ds = [u.VaiTro].concat(ds);   // giữ vai trò hiện tại
        return ds.map(function(x){
          return '<option value="'+x+'"'+(u&&x===u.VaiTro?' selected':'')+'>'
               + esc(TEN_VAI_TRO[x]||x)+'</option>'; }).join('');
      })()
  + '</select></div>'
  + '<div class="field"><label>Bộ phận</label><select id="uBP"'+(S.me.VaiTro==='Manage'?' disabled':'')+'>'
  +   opt(S.me.VaiTro==='Manage' ? [S.me.BoPhan] : cfgList('BoPhan'), u?u.BoPhan:S.me.BoPhan)+'</select></div>'
  + '<div class="field"><label>Phân quyền</label><select id="uPQ">'+opt(['Toàn quyền','Chỉ xem'], u?u.PhanQuyen:'Toàn quyền')+'</select></div>'
  + '<div class="field"><label>Phạm vi dữ liệu</label><select id="uDS">'
  +   '<option value="">— Theo mặc định của vai trò —</option>'
  +   ['DS01','DS02','DS03','DS04','DS05','DS06'].map(function(x){
        return '<option value="'+x+'"'+(u&&u.PhamViDuLieu===x?' selected':'')+'>'
             + esc(TEN_PHAM_VI_DL[x])+'</option>'; }).join('')
  + '</select><span class="small muted">Quyết định người này nhìn thấy dữ liệu tới đâu. '
  + 'Kiểm tra riêng, không phụ thuộc quyền thao tác.</span></div>'
  + '<div class="field"><label>Chức danh</label><input id="uCD" value="'+esc(u&&u.ChucDanh?u.ChucDanh:'')+'" placeholder="Trưởng phòng, Chuyên viên..."></div>'
  + '<div class="field"><label>Quản lý trực tiếp</label><select id="uQL">'
  +   '<option value="">— chưa khai —</option>'
  +   S.users.filter(function(x){ return !u || x.Ten !== u.Ten; }).map(function(x){
        return '<option value="'+esc(x.Ten)+'"'+(u&&u.QuanLyTrucTiep===x.Ten?' selected':'')+'>'
             + esc(x.Ten)+'</option>'; }).join('')
  + '</select></div>'
  + '<div class="field"><label>Màu avatar</label><input id="uMau" type="color" value="'+esc(u?u.MauAvatar:'#3357ff')+'"></div>'
  + '<div class="field"><label>Telegram Chat ID</label><input id="uTg" placeholder="vd: 812345678" value="'+esc(u&&u.TelegramChatID?u.TelegramChatID:'')+'"></div>'
  + '<div class="field"><label>Zalo User ID</label><input id="uZl" placeholder="vd: 3654...9821" value="'+esc(u&&u.ZaloUserID?u.ZaloUserID:'')+'"></div>'
  + '<div class="field"><label>Là lái xe</label><select id="uLaiXe">'
  +   '<option value="0"'+(u&&u.LaLaiXe?'':' selected')+'>Không</option>'
  +   '<option value="1"'+(u&&u.LaLaiXe?' selected':'')+'>Có</option></select>'
  +   '<span class="small muted">Lái xe vẫn làm mọi việc như nhân viên thường, '
  +   'cộng thêm quyền nhận chuyến, nhập km và hoá đơn cho xe mình phụ trách.</span></div>'
  + '<div class="field full"><label>Mật khẩu '+(u?'(để trống nếu không đổi)':'(mặc định 123456)')+'</label><input id="uPass" type="password"></div>'
  + '</div><div class="modal-foot"><button class="btn" onclick="closeModal()">Huỷ</button>'
  + '<button class="btn primary" onclick="saveUser('+(u?"'"+u.ID+"'":'null')+')">Lưu</button></div>');
}

function saveUser(id){
  var v = function(x){ return document.getElementById(x).value; };
  if (!v('uTen').trim()) { toast('Nhập tên đăng nhập'); return; }
  if (v('uPass') && v('uPass').length < 6) { toast('Mật khẩu phải từ 6 ký tự'); return; }
  call('apiSaveUser', [S.token, { ID:id||undefined, Ten:v('uTen').trim(), Email:v('uEmail'),
    VaiTro:v('uVT'), BoPhan:v('uBP'), PhanQuyen:v('uPQ'), MauAvatar:v('uMau'), MatKhau:v('uPass'),
    TelegramChatID:v('uTg').trim(), ZaloUserID:v('uZl').trim(),
    LaLaiXe: v('uLaiXe')==='1',
    PhamViDuLieu: v('uDS'), ChucDanh: v('uCD'), QuanLyTrucTiep: v('uQL') }],
    function(r){ if(!r.ok){toast(r.msg);return;} closeModal(); toast('Đã lưu'); reload(); });
}
function openResetPass(id){
  var u = S.users.filter(function(x){ return x.ID === id; })[0];
  if (!u) return;
  openModal('<h3>🔑 Đặt lại mật khẩu</h3>'
  + '<p class="muted small">Đặt mật khẩu mới cho <b>' + esc(u.Ten) + '</b>. '
  + 'Người dùng nên tự đổi lại trong mục Cài đặt sau khi đăng nhập.</p>'
  + '<div class="field"><label>Mật khẩu mới (từ 6 ký tự)</label>'
  +   '<input id="rpNew" type="password" autocomplete="new-password"></div>'
  + '<div class="field"><label>Nhập lại</label>'
  +   '<input id="rpNew2" type="password" autocomplete="new-password"></div>'
  + '<div class="modal-foot"><button class="btn" onclick="closeModal()">Huỷ</button>'
  + '<button class="btn primary" onclick="doResetPass(\'' + id + '\')">Đặt lại</button></div>');
}

function doResetPass(id){
  var a = document.getElementById('rpNew').value, b = document.getElementById('rpNew2').value;
  if (a.length < 6){ toast('Mật khẩu phải từ 6 ký tự'); return; }
  if (a !== b){ toast('Hai ô mật khẩu không khớp'); return; }
  call('apiResetPassword', [S.token, id, a], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã đặt lại mật khẩu');
  });
}

function delUser(id){
  if (!confirm('Xoá người dùng này?')) return;
  call('apiDeleteUser', [S.token, id], function(r){
    if(!r.ok){toast(r.msg);return;} toast('Đã xoá'); reload(); });
}
/* ============ 9. CÀI ĐẶT THÔNG BÁO ============ */
function viewSettings(){
  return khoiAnhDaiDien() + theDoiMatKhau()
       + (S.me.VaiTro === 'Admin' ? khoiTroLyAI() + khoiKenhThongBao() : '');
}

function khoiTroLyAI(){
  return '<div class="card"><h3>✨ Trợ lý AI viết tờ trình</h3>'
  + '<p class="muted small">Dùng được khoá của <b>Anthropic (Claude)</b> hoặc <b>OpenAI (GPT)</b>. '
  + 'Cả hai đều tính tiền theo lượt dùng, phải nạp tiền vào tài khoản tương ứng. '
  + 'Khoá lưu trong Script Properties, không nằm trong Google Sheet.</p>'
  + '<div id="aiSetBox">' + khungCho(3) + '</div></div>';
}

function loadAISettings(){
  if (S.me.VaiTro !== 'Admin') return;
  call('apiGetAISettings', [S.token], function(r){
    var box = document.getElementById('aiSetBox');
    if (!box) return;
    if (!r.ok){ box.textContent = r.msg; return; }
    box.classList.remove('muted');
    var sel = function(id, ds, val){
      return '<select id="' + id + '">' + ds.map(function(x){
        var v = x[0], nhan = x[1];
        return '<option value="' + esc(v) + '"' + (v === val ? ' selected' : '') + '>' + esc(nhan) + '</option>';
      }).join('') + '</select>';
    };
    box.innerHTML = '<div class="form-grid">'
    + '<div class="field"><label>Bật trợ lý AI</label>'
    +   sel('aiOn', [['1','Bật'],['0','Tắt']], r.aiOn ? '1' : '0') + '</div>'
    + '<div class="field"><label>Nhà cung cấp</label>'
    +   '<select id="aiNcc" onchange="doiNhaCungCap()">'
    +   '<option value="anthropic"' + (r.aiNcc !== 'openai' ? ' selected' : '') + '>Anthropic — Claude</option>'
    +   '<option value="openai"' + (r.aiNcc === 'openai' ? ' selected' : '') + '>OpenAI — GPT</option>'
    +   '</select></div>'
    + '<div class="field"><label id="aiKeyNhan">Khoá API</label><input id="aiKey" type="password" value="' + esc(r.aiKey) + '">'
    +   '<span class="small muted" id="aiKeyGoi"></span></div>'
    + '<div class="field"><label>Mô hình</label><input id="aiModel" list="dsModel" value="' + esc(r.aiModel) + '">'
    +   '<datalist id="dsModel"></datalist>'
    +   '<span class="small muted" id="aiModelGoi"></span></div>'
    + '<div class="field"><label>Mức đầu tư suy nghĩ <i class="small muted">(chỉ áp dụng cho Claude)</i></label>'
    +   sel('aiEffort', [['low','Thấp — nhanh, đủ cho tờ trình'],
                         ['medium','Vừa'],['high','Cao — chậm hơn, tốn hơn']], r.aiEffort) + '</div>'
    + '<div class="field"><label>Giới hạn lượt gọi mỗi ngày</label><input id="aiGioiHan" type="number" min="1" max="1000" value="' + esc(r.aiGioiHan) + '">'
    +   '<span class="small muted">Chặn chi phí vượt dự kiến</span></div>'
    + '<div class="field"><label>Đã dùng hôm nay</label><input value="' + r.daDungHomNay + ' lượt" disabled></div>'
    + '</div>'
    + '<div class="modal-foot" style="justify-content:flex-start">'
    +   '<button class="btn primary" onclick="luuAISettings()">Lưu cài đặt AI</button>'
    +   '<button class="btn" onclick="testAI()">Gọi thử</button></div>'
    + '<div id="aiTestKq"></div>';
    doiNhaCungCap(true);
  });
}

/** Đổi nhà cung cấp thì đổi gợi ý khoá và danh sách mô hình */
function doiNhaCungCap(lanDau){
  var ncc = document.getElementById('aiNcc').value;
  var laOpenAI = ncc === 'openai';
  var ds = laOpenAI
    ? ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']
    : ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];

  document.getElementById('aiKeyNhan').textContent = 'Khoá API ' + (laOpenAI ? '(sk-...)' : '(sk-ant-...)');
  document.getElementById('aiKeyGoi').innerHTML = laOpenAI
    ? 'Lấy tại <b>platform.openai.com</b> → API keys'
    : 'Lấy tại <b>console.anthropic.com</b> → API Keys';
  document.getElementById('dsModel').innerHTML =
    ds.map(function(x){ return '<option value="' + esc(x) + '">'; }).join('');
  document.getElementById('aiModelGoi').innerHTML = laOpenAI
    ? 'Gõ đúng tên mô hình có trên tài khoản OpenAI của bạn. Danh sách gợi ý có thể chưa đủ — '
      + 'xem tên chính xác tại <b>platform.openai.com/docs/models</b>.'
    : 'Opus 5 viết tốt nhất, Sonnet 5 rẻ hơn ~2,5 lần, Haiku 4.5 rẻ và nhanh nhất.';

  // Đổi nhà cung cấp thì mô hình cũ không còn dùng được, đặt lại mặc định
  var oM = document.getElementById('aiModel');
  if (!lanDau) oM.value = ds[0];
  else if (!oM.value) oM.value = ds[0];
}

function luuAISettings(){
  var v = function(x){ return document.getElementById(x).value; };
  if (!v('aiModel').trim()){ toast('Nhập tên mô hình'); return; }
  call('apiSaveAISettings', [S.token, {
    aiOn: v('aiOn') === '1', aiNcc: v('aiNcc'), aiKey: v('aiKey'), aiModel: v('aiModel').trim(),
    aiEffort: v('aiEffort'), aiGioiHan: v('aiGioiHan')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã lưu cài đặt AI'); loadAISettings();
  });
}

function testAI(){
  document.getElementById('aiTestKq').innerHTML = '<div class="small muted">Đang gọi...</div>';
  call('apiTestAI', [S.token], function(r){
    document.getElementById('aiTestKq').innerHTML = r.ok
      ? '<div class="nhac">✅ Kết nối được. AI trả lời: ' + esc(r.msg) + '</div>'
      : '<div class="nhac xong" style="border-left-color:var(--danger)">⚠️ ' + esc(r.msg) + '</div>';
  });
}

/* --- Ảnh đại diện: ai cũng tự đổi được ảnh của mình --- */
function khoiAnhDaiDien(){
  var anh = S.me.AnhDaiDien || '';
  return '<div class="card"><h3>🖼 Ảnh đại diện</h3>'
  + '<p class="muted small">Ảnh hiện ở mọi nơi có tên bạn: thẻ Kanban, bình luận, tin nhắn, chuỗi liên thông. '
  + 'Ảnh được thu nhỏ ngay trên máy bạn trước khi gửi nên rất nhẹ.</p>'
  + '<div class="anh-khoi">'
  +   '<div id="anhXem" class="anh-to" style="' + (anh
        ? 'background-image:url(' + anh + ')'
        : 'background:' + esc(S.me.MauAvatar || '#64748b')) + '">'
  +     (anh ? '' : esc(String(S.me.Ten || '?').charAt(0).toUpperCase())) + '</div>'
  +   '<div style="display:flex;flex-direction:column;gap:8px">'
  +     '<input type="file" id="anhInput" accept="image/png,image/jpeg,image/webp" style="display:none" onchange="chonAnh(event)">'
  +     '<button class="btn primary" onclick="document.getElementById(\'anhInput\').click()">Chọn ảnh từ máy</button>'
  +     (anh ? '<button class="btn" onclick="xoaAnh()">Bỏ ảnh, quay lại chữ cái</button>' : '')
  +   '</div>'
  + '</div></div>';
}

/** Thu nhỏ ảnh về 160px và nén JPEG ngay trên trình duyệt.
 *  Làm vậy ảnh chỉ còn vài KB, vừa đủ để lưu thẳng vào ô của Sheet. */
function chonAnh(ev){
  var f = (ev.target.files || [])[0];
  ev.target.value = '';
  if (!f) return;
  if (f.size > 12 * 1024 * 1024){ toast('Ảnh gốc quá nặng, chọn ảnh dưới 12 MB'); return; }

  var fr = new FileReader();
  fr.onload = function(){
    var img = new Image();
    img.onload = function(){
      var canh = 160;
      var cv = document.createElement('canvas');
      cv.width = canh; cv.height = canh;
      var ctx = cv.getContext('2d');
      // Cắt vuông ở giữa rồi mới thu nhỏ, để ảnh không bị bóp méo
      var c = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - c) / 2, (img.height - c) / 2, c, c, 0, 0, canh, canh);
      luuAnh(cv.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function(){ toast('Không đọc được ảnh này'); };
    img.src = String(fr.result);
  };
  fr.readAsDataURL(f);
}

function luuAnh(dataUrl){
  call('apiSaveAvatar', [S.token, dataUrl, null], function(r){
    if (!r.ok){ toast(r.msg); return; }
    S.me.AnhDaiDien = r.anh;
    S.users.forEach(function(u){ if (u.Ten === S.me.Ten) u.AnhDaiDien = r.anh; });
    toast(r.anh ? 'Đã cập nhật ảnh đại diện' : 'Đã bỏ ảnh');
    render(); renderShell();
  });
}

function xoaAnh(){ if (confirm('Bỏ ảnh đại diện?')) luuAnh(''); }

/* --- Đổi mật khẩu của chính mình: mọi vai trò đều dùng được --- */
function theDoiMatKhau(){
  return '<div class="card"><h3>🔑 Đổi mật khẩu của tôi</h3>'
  + '<p class="muted small">Đang đăng nhập: <b>' + esc(S.me.Ten) + '</b> — '
  +   esc(TEN_VAI_TRO[S.me.VaiTro] || S.me.VaiTro)
  +   (S.me.BoPhan ? ' · phòng ' + esc(S.me.BoPhan) : '') + '</p>'
  + '<div class="form-grid" style="max-width:640px">'
  + '<div class="field"><label>Mật khẩu hiện tại</label>'
  +   '<input id="pwCu" type="password" autocomplete="current-password"></div>'
  + '<div class="field"></div>'
  + '<div class="field"><label>Mật khẩu mới (từ 6 ký tự)</label>'
  +   '<input id="pwMoi" type="password" autocomplete="new-password"></div>'
  + '<div class="field"><label>Nhập lại mật khẩu mới</label>'
  +   '<input id="pwMoi2" type="password" autocomplete="new-password"></div>'
  + '</div>'
  + '<div class="modal-foot" style="justify-content:flex-start">'
  +   '<button class="btn primary" onclick="doiMatKhau()">Đổi mật khẩu</button></div></div>';
}

function doiMatKhau(){
  var cu = document.getElementById('pwCu').value,
      a  = document.getElementById('pwMoi').value,
      b  = document.getElementById('pwMoi2').value;
  if (!cu){ toast('Nhập mật khẩu hiện tại'); return; }
  if (a.length < 6){ toast('Mật khẩu mới phải từ 6 ký tự'); return; }
  if (a !== b){ toast('Hai ô mật khẩu mới không khớp'); return; }
  if (a === cu){ toast('Mật khẩu mới trùng mật khẩu cũ'); return; }
  call('apiChangePassword', [S.token, cu, a], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã đổi mật khẩu');
    ['pwCu','pwMoi','pwMoi2'].forEach(function(x){ document.getElementById(x).value = ''; });
  });
}

function khoiKenhThongBao(){
  return '<div class="card"><h3>⚙️ Kênh thông báo</h3>'
  + '<p class="muted small">Khoá bí mật lưu trong Script Properties, không nằm trong Google Sheet. '
  + 'Ô hiện dấu chấm nghĩa là đã có khoá — để nguyên nếu không muốn đổi.</p>'
  + '<div id="setBox">' + khungCho(3) + '</div></div>'
  + '<div class="card"><h3>📖 Cách lấy thông tin</h3>'
  + '<div class="grid g2">'
  + '<div><b class="small">Telegram (khuyến nghị)</b><ol class="guide">'
  +   '<li>Nhắn <code>/newbot</code> cho <b>@BotFather</b> trên Telegram, đặt tên bot.</li>'
  +   '<li>BotFather trả về <b>Bot Token</b> — dán vào ô bên trên.</li>'
  +   '<li>Mỗi nhân sự nhắn 1 tin bất kỳ cho bot vừa tạo.</li>'
  +   '<li>Bấm <b>Lấy Chat ID</b> để đọc danh sách, rồi gán cho từng người ở mục Người dùng.</li>'
  + '</ol></div>'
  + '<div><b class="small">Zalo OA</b><ol class="guide">'
  +   '<li>Tạo Official Account tại <code>oa.zalo.me</code> và ứng dụng tại <code>developers.zalo.me</code>.</li>'
  +   '<li>Lấy <b>App ID</b>, <b>App Secret</b> và <b>Refresh Token</b> từ trang quản lý ứng dụng.</li>'
  +   '<li>Chạy menu <b>Task Pro → Cài trigger làm mới token Zalo</b> (token hết hạn sau 25 giờ).</li>'
  +   '<li>Zalo chỉ cho gửi tới người đã nhắn cho OA trong <b>7 ngày</b> gần nhất.</li>'
  + '</ol></div></div></div>';
}

function loadSettings(){
  if (S.me.VaiTro !== 'Admin') return;
  loadAISettings();
  call('apiGetSettings', [S.token], function(r){
    var box = document.getElementById('setBox');
    if (!box) return;
    if (!r.ok){ box.textContent = r.msg; return; }
    box.classList.remove('muted');
    box.innerHTML =
      '<div class="form-grid">'
    + '<div class="field"><label>Bật Telegram</label>'
    +   '<select id="stTgOn"><option value="1"'+(r.telegramOn?' selected':'')+'>Bật</option>'
    +   '<option value="0"'+(r.telegramOn?'':' selected')+'>Tắt</option></select></div>'
    + '<div class="field"><label>Telegram Bot Token</label><input id="stTgToken" value="'+esc(r.telegramToken)+'"></div>'
    + '<div class="field"><label>Bật Zalo OA</label>'
    +   '<select id="stZlOn"><option value="1"'+(r.zaloOn?' selected':'')+'>Bật</option>'
    +   '<option value="0"'+(r.zaloOn?'':' selected')+'>Tắt</option></select></div>'
    + '<div class="field"><label>Zalo App ID</label><input id="stZlApp" value="'+esc(r.zaloAppId)+'"></div>'
    + '<div class="field"><label>Zalo App Secret</label><input id="stZlSecret" value="'+esc(r.zaloSecret)+'"></div>'
    + '<div class="field"><label>Zalo Refresh Token</label><input id="stZlRefresh" value="'+esc(r.zaloRefresh)+'"></div>'
    + '<div class="field"><label>Gửi email nhắc việc</label>'
    +   '<select id="stMailOn"><option value="1"'+(r.emailOn?' selected':'')+'>Bật</option>'
    +   '<option value="0"'+(r.emailOn?'':' selected')+'>Tắt</option></select></div>'
    + '<div class="field"><label>Giờ gửi cảnh báo hằng ngày</label><input id="stGio" type="number" min="0" max="23" value="'+esc(r.gioCanhBao)+'"></div>'
    + '<div class="field"><label>Cảnh báo trước hạn (ngày)</label><input id="stTruoc" type="number" min="0" max="30" value="'+esc(r.canhBaoTruoc)+'"></div>'
    + '<div class="field"><label>Token Zalo làm mới lần cuối</label><input value="'+esc(r.zaloRefreshedAt||'chưa lần nào')+'" disabled></div>'
    + '<div class="field"><label>Bộ phận điều xe</label>'
    +   '<input id="stBpXe" value="'+esc(r.boPhanDieuXe||'')+'" placeholder="HCNS">'
    +   '<span class="small muted">Nhân viên thuộc bộ phận này duyệt và chốt xe được '
    +   'mà không cần nâng lên vai trò Quản lý.</span></div>'
    + '<div class="field"><label>Theo dõi km và chi phí chuyến xe</label>'
    +   '<select id="stXeKm"><option value="1"'+(r.xeTheoDoiKm?' selected':'')+'>Bật</option>'
    +   '<option value="0"'+(r.xeTheoDoiKm?'':' selected')+'>Tắt</option></select>'
    +   '<span class="small muted">Tắt thì chuyến kết thúc ngay, không phải nhập km và chi phí.</span></div>'
    + '</div>'
    + '<div class="modal-foot" style="justify-content:flex-start;flex-wrap:wrap">'
    +   '<button class="btn primary" onclick="saveSettings()">Lưu cài đặt</button>'
    +   '<button class="btn" onclick="testNotify(\'telegram\')">Gửi thử Telegram</button>'
    +   '<button class="btn" onclick="testNotify(\'zalo\')">Gửi thử Zalo</button>'
    +   '<button class="btn" onclick="testNotify(\'email\')">Gửi thử Email</button>'
    +   '<button class="btn" onclick="testNotify(\'zalo-refresh\')">Làm mới token Zalo</button>'
    +   '<button class="btn" onclick="getChatIds()">Lấy Chat ID Telegram</button>'
    + '</div><div id="chatIdBox"></div>';
  });
}

function saveSettings(){
  var v = function(x){ return document.getElementById(x).value; };
  call('apiSaveSettings', [S.token, {
    telegramOn: v('stTgOn')==='1', telegramToken: v('stTgToken'),
    zaloOn: v('stZlOn')==='1', zaloAppId: v('stZlApp'),
    zaloSecret: v('stZlSecret'), zaloRefresh: v('stZlRefresh'),
    emailOn: v('stMailOn')==='1', gioCanhBao: v('stGio'), canhBaoTruoc: v('stTruoc'),
    boPhanDieuXe: v('stBpXe'), xeTheoDoiKm: v('stXeKm')==='1'
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã lưu cài đặt. Chạy lại menu cài trigger nếu đổi giờ cảnh báo.');
    loadSettings();
  });
}

function testNotify(kenh){
  call('apiTestNotify', [S.token, kenh], function(r){
    toast(r.ok ? 'Gửi thành công' : 'Thất bại: ' + r.msg);
    if (kenh === 'zalo-refresh' && r.ok) loadSettings();
  });
}

function getChatIds(){
  call('apiTelegramChatIds', [S.token], function(r){
    var box = document.getElementById('chatIdBox');
    if (!r.ok){ box.innerHTML = '<p class="muted small">'+esc(r.msg)+'</p>'; return; }
    if (!r.list.length){
      box.innerHTML = '<p class="muted small">Chưa ai nhắn cho bot. Nhờ từng người gửi 1 tin cho bot rồi bấm lại.</p>';
      return;
    }
    box.innerHTML = '<div class="scroll-x"><table><tr><th>Tên trên Telegram</th><th>Username</th><th>Chat ID</th></tr>'
      + r.list.map(function(c){
          return '<tr><td>'+esc(c.ten)+'</td><td class="muted">'+esc(c.username)+'</td>'
               + '<td><code>'+esc(c.chatId)+'</code></td></tr>';
        }).join('') + '</table></div>'
      + '<p class="muted small">Sao chép Chat ID rồi dán vào hồ sơ từng người ở mục <b>Người dùng</b>.</p>';
  });
}
/* ============ 10. CÔNG VIỆC LẶP TỰ ĐỘNG ============ */
var TEN_THU = {1:'T2',2:'T3',3:'T4',4:'T5',5:'T6',6:'T7',7:'CN'};
var CHU_KY = ['Hàng ngày','Hàng tuần','Hàng tháng'];

function viewRecurring(){
  var quanLy = ['Admin','Manage'].indexOf(S.me.VaiTro) >= 0;
  return '<div class="card"><h3 style="justify-content:space-between">🔁 Công việc lặp tự động'
  + '<span style="display:flex;gap:8px">'
  +   (quanLy ? '<button class="btn sm" onclick="runRulesNow()">▶ Chạy ngay</button>' : '')
  +   '<button class="btn primary sm" onclick="openRuleForm()">+ Thêm luật lặp</button></span></h3>'
  + '<p class="muted small">Mỗi ngày lúc 1h sáng hệ thống quét các luật đang bật và sinh công việc cho ngày đó. '
  + 'Một luật chỉ sinh tối đa một công việc mỗi ngày.</p>'
  + '<div id="ruleBox">' + khungCho(3) + '</div></div>';
}

function moTaChuKy(r){
  if (r.ChuKy === 'Hàng ngày') return 'Mỗi ngày' + (r.BoQuaCuoiTuan ? ' (trừ T7, CN)' : '');
  if (r.ChuKy === 'Hàng tuần'){
    var ds = String(r.ThuTrongTuan||'').split(',').filter(Boolean)
      .map(function(x){ return TEN_THU[Number(x)] || x; });
    return 'Mỗi tuần vào ' + (ds.length ? ds.join(', ') : '—');
  }
  return 'Mỗi tháng ngày ' + r.NgayTrongThang;
}

function loadRules(){
  call('apiGetRecurring', [S.token], function(rows){
    S.rules = rows;
    var box = document.getElementById('ruleBox');
    if (!box) return;
    box.classList.remove('muted');
    if (!rows.length){
      box.innerHTML = '<p class="muted">Chưa có luật lặp nào. Ví dụ hay dùng: '
        + '“Báo cáo doanh thu ngày” lặp mỗi ngày trừ cuối tuần, hoặc “Chốt công nợ” lặp ngày 25 hằng tháng.</p>';
      return;
    }
    box.innerHTML = '<div class="scroll-x"><table>'
    + '<tr><th>Công việc</th><th>Chu kỳ</th><th>Phụ trách</th><th>Ưu tiên</th>'
    + '<th>Hạn sau</th><th>Hiệu lực</th><th>Lần cuối tạo</th><th>Trạng thái</th><th></th></tr>'
    + rows.map(function(r){
        var bat = r.TrangThai === 'Bật';
        return '<tr><td><b>' + esc(r.TenCongViec) + '</b></td>'
          + '<td>' + esc(moTaChuKy(r)) + '</td>'
          + '<td>' + avatarHtml(r.PhuTrach) + ' ' + esc(r.PhuTrach) + '</td>'
          + '<td>' + chip(r.MucDo, MAU_MD[r.MucDo] || '#94a3b8') + '</td>'
          + '<td>' + (r.SoNgayLam ? r.SoNgayLam + ' ngày' : 'trong ngày') + '</td>'
          + '<td class="small muted">' + esc(dmy(r.NgayBatDau) || '—')
          +   (r.NgayKetThuc ? ' → ' + esc(dmy(r.NgayKetThuc)) : ' → không giới hạn') + '</td>'
          + '<td class="small">' + esc(r.LanCuoiTao ? dmy(r.LanCuoiTao) : 'chưa') + '</td>'
          + '<td><button class="btn sm" onclick="toggleRule(\'' + r.ID + '\')">'
          +   chip(bat ? 'Bật' : 'Tắt', bat ? '#10b981' : '#94a3b8') + '</button></td>'
          + '<td><button class="btn sm" onclick="openRuleForm(\'' + r.ID + '\')">✏️</button> '
          + '<button class="btn sm" onclick="delRule(\'' + r.ID + '\')">🗑</button></td></tr>';
      }).join('') + '</table></div>';
  });
}

function openRuleForm(id){
  var r = id ? S.rules.filter(function(x){ return x.ID === id; })[0] : null;
  var canAssign = ['Admin','Manage'].indexOf(S.me.VaiTro) >= 0;
  var opt = function(l, v){ return l.map(function(x){
    return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); };
  var thuDaChon = String(r ? r.ThuTrongTuan : '').split(',').filter(Boolean);

  openModal('<h3>' + (r ? '✏️ Sửa luật lặp' : '🔁 Thêm luật lặp') + '</h3><div class="form-grid">'
  + '<div class="field full"><label>Tên công việc sẽ sinh ra *</label><input id="rTen" value="' + esc(r ? r.TenCongViec : '') + '"></div>'
  + '<div class="field full"><label>Mô tả</label><textarea id="rMoTa" rows="2">' + esc(r ? r.MoTa : '') + '</textarea></div>'
  + '<div class="field"><label>Người phụ trách *</label><select id="rPT"' + (canAssign ? '' : ' disabled') + '>'
  +   opt(S.users.map(function(u){ return u.Ten; }), r ? r.PhuTrach : S.me.Ten) + '</select></div>'
  + '<div class="field"><label>Bộ phận</label><select id="rBP">' + opt([''].concat(cfgList('BoPhan')), r ? r.BoPhan : S.me.BoPhan) + '</select></div>'
  + '<div class="field"><label>Mức độ ưu tiên</label><select id="rMD">' + opt(['Thấp','Trung bình','Cao','Khẩn cấp'], r ? r.MucDo : 'Trung bình') + '</select></div>'
  + '<div class="field"><label>Lĩnh vực</label><select id="rLV">' + opt(cfgList('LinhVuc'), r ? r.LinhVuc : 'Chưa phân loại') + '</select></div>'
  + '<div class="field"><label>Chu kỳ lặp *</label><select id="rCK" onchange="ruleCycleUI()">' + opt(CHU_KY, r ? r.ChuKy : 'Hàng ngày') + '</select></div>'
  + '<div class="field"><label>Hạn chót sau (ngày)</label><input id="rSoNgay" type="number" min="0" max="90" value="' + (r ? r.SoNgayLam : 0) + '">'
  +   '<span class="small muted">0 = hạn ngay trong ngày sinh việc</span></div>'
  + '<div class="field full" id="rDaily"><label>Tuỳ chọn</label>'
  +   '<label class="chk"><input type="checkbox" id="rBoQua"' + (r && r.BoQuaCuoiTuan ? ' checked' : '') + '> Bỏ qua thứ Bảy và Chủ nhật</label></div>'
  + '<div class="field full" id="rWeekly"><label>Lặp vào các thứ *</label><div class="thu-row">'
  +   [1,2,3,4,5,6,7].map(function(n){
        return '<label class="thu"><input type="checkbox" value="' + n + '"'
             + (thuDaChon.indexOf(String(n)) >= 0 ? ' checked' : '') + '> ' + TEN_THU[n] + '</label>';
      }).join('') + '</div></div>'
  + '<div class="field" id="rMonthly"><label>Ngày trong tháng *</label><input id="rNgayThang" type="number" min="1" max="31" value="' + (r ? r.NgayTrongThang : 1) + '">'
  +   '<span class="small muted">Chọn 31 thì tháng thiếu sẽ dồn về ngày cuối tháng</span></div>'
  + '<div class="field"><label>Bắt đầu hiệu lực</label><input id="rBD" type="date" value="' + (r && r.NgayBatDau ? r.NgayBatDau : today()) + '"></div>'
  + '<div class="field"><label>Kết thúc hiệu lực</label><input id="rKT" type="date" value="' + (r && r.NgayKetThuc ? r.NgayKetThuc : '') + '">'
  +   '<span class="small muted">Để trống = chạy mãi</span></div>'
  + '<div class="field"><label>Trạng thái</label><select id="rTT">' + opt(['Bật','Tắt'], r ? r.TrangThai : 'Bật') + '</select></div>'
  + '</div><div class="modal-foot">'
  +   (r ? '<button class="btn danger" onclick="delRule(\'' + r.ID + '\')">Xoá</button>' : '')
  +   '<button class="btn" onclick="closeModal()">Huỷ</button>'
  +   '<button class="btn primary" onclick="saveRule(' + (r ? "'" + r.ID + "'" : 'null') + ')">Lưu</button>'
  + '</div>');
  ruleCycleUI();
}

/** Chỉ hiện các ô cấu hình đúng với chu kỳ đang chọn */
function ruleCycleUI(){
  var ck = document.getElementById('rCK').value;
  document.getElementById('rDaily').style.display   = ck === 'Hàng ngày'  ? '' : 'none';
  document.getElementById('rWeekly').style.display  = ck === 'Hàng tuần'  ? '' : 'none';
  document.getElementById('rMonthly').style.display = ck === 'Hàng tháng' ? '' : 'none';
}

function saveRule(id){
  var v = function(x){ return document.getElementById(x).value; };
  var ck = v('rCK');
  var thu = [].slice.call(document.querySelectorAll('#rWeekly input:checked'))
              .map(function(c){ return c.value; }).join(',');
  if (!v('rTen').trim()){ toast('Nhập tên công việc'); return; }
  if (ck === 'Hàng tuần' && !thu){ toast('Chọn ít nhất một thứ trong tuần'); return; }
  if (v('rKT') && v('rKT') < v('rBD')){ toast('Ngày kết thúc phải sau ngày bắt đầu'); return; }

  call('apiSaveRecurring', [S.token, {
    ID: id || undefined, TenCongViec: v('rTen').trim(), MoTa: v('rMoTa'),
    PhuTrach: v('rPT'), BoPhan: v('rBP'), MucDo: v('rMD'), LinhVuc: v('rLV'),
    ChuKy: ck, ThuTrongTuan: thu, NgayTrongThang: Number(v('rNgayThang')) || 1,
    SoNgayLam: Number(v('rSoNgay')) || 0,
    BoQuaCuoiTuan: document.getElementById('rBoQua').checked,
    NgayBatDau: v('rBD'), NgayKetThuc: v('rKT'), TrangThai: v('rTT')
  }], function(res){
    if (!res.ok){ toast(res.msg); return; }
    closeModal(); toast(id ? 'Đã cập nhật luật lặp' : 'Đã tạo luật lặp'); loadRules();
  });
}

function toggleRule(id){
  call('apiToggleRecurring', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    loadRules();
  });
}

function delRule(id){
  if (!confirm('Xoá luật lặp này? Các công việc đã sinh ra trước đó vẫn được giữ nguyên.')) return;
  call('apiDeleteRecurring', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã xoá luật lặp'); loadRules();
  });
}

function runRulesNow(){
  call('apiRunRecurringNow', [S.token], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast(r.soTask ? 'Đã sinh ' + r.soTask + ' công việc' : 'Hôm nay không có luật nào đến hạn');
    loadRules(); reload();
  });
}
/* ============ 11. NHẮN TIN ============ */
function viewChat(){
  return '<div class="chat-wrap">'
  + '<aside class="chat-side">'
  +   '<div class="chat-side-head"><b>Trò chuyện</b>'
  +     '<span style="display:flex;gap:6px">'
  +       '<button class="btn sm" title="Nhắn riêng" onclick="openDirectPicker()">✉️</button>'
  +       '<button class="btn primary sm" title="Tạo nhóm" onclick="openGroupForm()">+ Nhóm</button>'
  +     '</span></div>'
  +   '<div id="roomList" class="room-list">' + khungCho(3) + '</div>'
  + '</aside>'
  + '<section class="chat-main" id="chatMain">'
  +   '<div class="chat-empty">Chọn một cuộc trò chuyện bên trái, hoặc bấm ✉️ để nhắn riêng cho ai đó.</div>'
  + '</section></div>';
}

function loadRooms(giuPhong){
  call('apiGetRooms', [S.token], function(rows){
    S.rooms = rows;
    S.tinChuaDoc = rows.reduce(function(n, r){ return n + r.chuaDoc; }, 0);
    renderShell();
    var box = document.getElementById('roomList');
    if (!box) return;
    box.classList.remove('muted','small');
    box.innerHTML = rows.length
      ? rows.map(function(r){
          return '<div class="room' + (r.ID === S.roomId ? ' active' : '') + '" onclick="openRoom(\'' + r.ID + '\')">'
            + '<div class="room-ico">' + (r.Loai === 'Nhóm' ? '👥' : avatarHtml(r.Ten)) + '</div>'
            + '<div class="room-body"><div class="room-top"><b>' + esc(r.Ten) + '</b>'
            +   (r.chuaDoc ? '<span class="unread">' + r.chuaDoc + '</span>' : '') + '</div>'
            + '<div class="room-last">' + esc(r.tinCuoi || 'Chưa có tin nhắn') + '</div></div></div>';
        }).join('')
      : '<div class="muted small" style="padding:10px">Chưa có cuộc trò chuyện nào.</div>';
    if (giuPhong && S.roomId) return;
    if (!S.roomId && rows.length) openRoom(rows[0].ID);
  });
}

function openRoom(id){
  S.roomId = id;
  if (S.chatTimer) clearInterval(S.chatTimer);
  veTinNhan(true);
  // Apps Script không có kết nối thời gian thực nên phải hỏi lại theo chu kỳ.
  // 20 giây là mức cân bằng giữa độ trễ và hạn mức chạy của Google.
  S.chatTimer = setInterval(function(){
    if (S.view === 'chat' && S.roomId && !document.hidden) veTinNhan(false);
  }, 20000);
}

function veTinNhan(cuonXuong){
  call('apiGetMessages', [S.token, S.roomId], function(r){
    if (!r.ok){ toast(r.msg); return; }
    var box = document.getElementById('chatMain');
    if (!box) return;
    var cuoi = r.tin.length ? r.tin[r.tin.length-1].ID : null;
    var daODay = box.querySelector('.msg-list');
    if (!cuonXuong && daODay && cuoi === S.chatLastId) return;   // không có tin mới thì khỏi vẽ lại
    S.chatLastId = cuoi;

    var laNhom = r.loai === 'Nhóm';
    var suaDuoc = laNhom && (r.nguoiTao === S.me.Ten || S.me.VaiTro === 'Admin');
    box.innerHTML =
      '<div class="chat-head"><div><b>' + esc(r.ten) + '</b>'
      + '<div class="small muted">' + (laNhom ? r.thanhVien.length + ' thành viên: ' : '')
      +   esc(r.thanhVien.join(', ')) + '</div></div>'
      + '<span style="display:flex;gap:6px">'
      +   (suaDuoc ? '<button class="btn sm" onclick="openGroupForm(\'' + r.ID + '\')">Sửa nhóm</button>' : '')
      +   '<button class="btn sm" onclick="roiPhong(\'' + S.roomId + '\')">Rời</button></span></div>'
      + '<div class="msg-list" id="msgList">'
      + (r.tin.length ? r.tin.map(function(m, i){
          var toi = m.NguoiGui === S.me.Ten;
          var lienTiep = i > 0 && r.tin[i-1].NguoiGui === m.NguoiGui;
          return '<div class="msg' + (toi ? ' me' : '') + (lienTiep ? ' tiep' : '') + '">'
            + (toi || lienTiep ? '<span class="msg-sp"></span>' : avatarHtml(m.NguoiGui))
            + '<div class="msg-bd">'
            + (toi || lienTiep ? '' : '<div class="msg-ai">' + esc(m.NguoiGui) + '</div>')
            + '<div class="msg-tx">' + highlightMentions(m.NoiDung) + '</div>'
            + '<div class="msg-gio">' + esc(m.ThoiGian.slice(11,16)) + '</div></div></div>';
        }).join('') : '<div class="chat-empty">Chưa có tin nhắn. Gửi lời chào đi.</div>')
      + '</div>'
      + '<div class="chat-box"><textarea id="msgInput" rows="1" placeholder="Nhập tin nhắn, gõ @ để nhắc tên... (Enter để gửi)"></textarea>'
      + '<button class="btn primary" onclick="guiTin()">Gửi</button></div>';

    var ip = document.getElementById('msgInput');
    ip.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); guiTin(); }
    });
    var ml = document.getElementById('msgList');
    if (ml) ml.scrollTop = ml.scrollHeight;
    if (cuonXuong) ip.focus();
  });
}

function guiTin(){
  var ip = document.getElementById('msgInput');
  var txt = ip.value.trim();
  if (!txt) return;
  ip.value = '';
  call('apiSendMessage', [S.token, S.roomId, txt], function(r){
    if (!r.ok){ toast(r.msg); ip.value = txt; return; }
    S.chatLastId = null;
    veTinNhan(true);
    loadRooms(true);
  });
}

function openDirectPicker(){
  var ds = S.users.filter(function(u){
    return u.Ten !== S.me.Ten && u.VaiTro !== 'View' && u.PhanQuyen !== 'Chỉ xem'; });
  if (!ds.length){ toast('Chưa có ai khác để nhắn tin'); return; }
  openModal('<h3>✉️ Nhắn tin riêng</h3>'
  + '<div class="field"><label>Chọn người nhận</label><select id="dmNguoi">'
  +   ds.map(function(u){
        return '<option value="' + esc(u.Ten) + '">' + esc(u.Ten)
             + ' — ' + esc(u.BoPhan || 'chưa rõ phòng') + '</option>'; }).join('')
  + '</select></div>'
  + '<div class="modal-foot"><button class="btn" onclick="closeModal()">Huỷ</button>'
  + '<button class="btn primary" onclick="taoChatRieng()">Mở trò chuyện</button></div>');
}

function taoChatRieng(){
  var ten = document.getElementById('dmNguoi').value;
  call('apiOpenDirect', [S.token, ten], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); S.roomId = r.id; loadRooms(true); openRoom(r.id);
  });
}

function openGroupForm(roomId){
  var room = roomId ? S.rooms.filter(function(x){ return x.ID === roomId; })[0] : null;
  var ds = S.users.filter(function(u){ return u.VaiTro !== 'View' && u.PhanQuyen !== 'Chỉ xem'; });
  openModal('<h3>' + (room ? '👥 Sửa nhóm' : '👥 Tạo nhóm mới') + '</h3>'
  + '<div class="field"><label>Tên nhóm *</label><input id="gpTen" value="' + esc(room ? room.Ten : '') + '"></div>'
  + '<div class="field"><label>Thành viên</label><div class="tv-list">'
  +   ds.map(function(u){
        var co = room ? room.ThanhVien.indexOf(u.Ten) >= 0 : u.Ten === S.me.Ten;
        var khoa = u.Ten === S.me.Ten && !room;
        return '<label class="tv"><input type="checkbox" value="' + esc(u.Ten) + '"'
             + (co ? ' checked' : '') + (khoa ? ' disabled' : '') + '> '
             + avatarHtml(u.Ten) + esc(u.Ten) + ' <i class="small muted">' + esc(u.BoPhan || '') + '</i></label>';
      }).join('')
  + '</div></div>'
  + '<div class="modal-foot"><button class="btn" onclick="closeModal()">Huỷ</button>'
  + '<button class="btn primary" onclick="luuNhom(' + (room ? "'" + room.ID + "'" : 'null') + ')">Lưu</button></div>');
}

function luuNhom(roomId){
  var ten = document.getElementById('gpTen').value.trim();
  if (!ten){ toast('Đặt tên nhóm'); return; }
  var tv = [].slice.call(document.querySelectorAll('.tv-list input:checked')).map(function(c){ return c.value; });
  if (tv.indexOf(S.me.Ten) < 0) tv.push(S.me.Ten);
  if (tv.length < 2){ toast('Nhóm cần ít nhất 2 thành viên'); return; }
  call(roomId ? 'apiUpdateGroup' : 'apiCreateGroup',
       roomId ? [S.token, roomId, ten, tv] : [S.token, ten, tv], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast(roomId ? 'Đã cập nhật nhóm' : 'Đã tạo nhóm');
    S.roomId = roomId || r.id; S.chatLastId = null;
    loadRooms(true); openRoom(S.roomId);
  });
}

function roiPhong(id){
  if (!confirm('Rời cuộc trò chuyện này?')) return;
  call('apiLeaveRoom', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    S.roomId = null; S.chatLastId = null; toast('Đã rời'); render();
  });
}
/* ============ 12. TỜ TRÌNH ============ */
function laToTrinh(t){ return t.Loai === 'Tờ trình'; }

function viewToTrinh(){
  var ds = filtered().filter(laToTrinh)
    .sort(function(a,b){ return String(b.SoToTrinh).localeCompare(String(a.SoToTrinh)); });
  return '<div class="card"><h3 style="justify-content:space-between">'+iconToTrinh(22)+' Tờ trình'
  + (chiDoc() ? '' : '<button class="btn primary sm" onclick="openToTrinhForm()">+ Soạn tờ trình</button>')
  + '</h3>'
  + '<p class="muted small">Tờ trình tạo xong nằm ở chỗ người tạo. Người tạo <b>kéo thẻ trên Kanban</b> để đổi trạng thái '
  + 'và bấm <b>Chuyển tiếp</b> để gửi cho người xử lý tiếp. Người đang giữ có nút Duyệt / Trả lại. '
  + 'Quy trình kết thúc khi ai đó đặt <b>Hoàn thành</b>.</p>'
  + (ds.length ? '<div class="scroll-x"><table>'
    + '<tr><th>Số</th><th>Về việc</th><th>Kính trình</th><th>Người trình</th><th>Bộ phận trình</th>'
    + '<th>Đang ở</th><th>Ưu tiên</th><th>Trạng thái</th><th>Ngày tạo</th><th></th></tr>'
    + ds.map(function(t){
        return '<tr><td><b class="mono-so">' + esc(t.SoToTrinh || '—') + '</b></td>'
          + '<td>' + esc(t.TenCongViec) + (S.soBinhLuan[t.ID] ? ' <span class="cmt-badge">💬 '+S.soBinhLuan[t.ID]+'</span>' : '') + '</td>'
          + '<td>' + esc(t.KinhTrinh || '—') + '</td>'
          + '<td>' + avatarHtml(t.NguoiGiao) + ' ' + esc(t.NguoiGiao) + '</td>'
          + '<td>' + esc(t.BoPhanTrinh || t.BoPhan) + '</td>'
          + '<td>' + avatarHtml(t.PhuTrach) + ' ' + esc(t.PhuTrach) + '</td>'
          + '<td>' + chip(t.MucDo, MAU_MD[t.MucDo] || '#94a3b8') + '</td>'
          + '<td>' + chip(t.TrangThai, MAU_TT[t.TrangThai]) + '</td>'
          + '<td class="small muted">' + esc(String(t.NgayTao).slice(0,16)) + '</td>'
          + '<td><button class="btn sm" onclick="openTaskForm(\'' + t.ID + '\')">Mở</button> '
          + '<button class="btn sm" title="Xem bản trình bày" onclick="xemToTrinh(\'' + t.ID + '\')">🖨</button></td></tr>';
      }).join('') + '</table></div>'
    : '<p class="muted">Chưa có tờ trình nào khớp bộ lọc.</p>')
  + '</div>';
}

function openToTrinhForm(){
  S.tepMoi = [];
  call('apiSoToTrinhKeTiep', [S.token], function(so){
    var opt = function(l, v){ return l.map(function(x){
      return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); };
    openModal('<h3>' + iconToTrinh(20) + ' Soạn tờ trình</h3>'
    + '<div class="form-grid">'
    + '<div class="field"><label>Số tờ trình</label><input value="' + esc(so) + '" disabled>'
    +   '<span class="small muted">Cấp tự động khi bấm Trình duyệt</span></div>'
    + '<div class="field"><label>Ngày giờ tạo</label><input value="' + esc(gioHienTai()) + '" disabled></div>'
    + '<div class="field"><label>Người trình</label><input value="' + esc(S.me.Ten)
    +   ' — ' + esc(S.me.BoPhan || '') + '" disabled></div>'
    + '<div class="field"><label>Bộ phận trình *</label><select id="ttBoPhan">'
    +   opt(cfgList('BoPhan'), S.me.BoPhan) + '</select></div>'
    + '<div class="field full"><label>Kính trình *</label>'
    +   '<input id="ttKinhTrinh" placeholder="Ví dụ: Ban Tổng Giám đốc, hoặc Ông Nguyễn Văn A — Tổng Giám đốc">'
    +   '<span class="small muted">Nhập tay đúng như trên văn bản giấy</span></div>'
    + '<div class="field full"><label>Về việc *</label>'
    +   '<input id="ttVeViec" placeholder="Tóm tắt một dòng, ví dụ: Xin duyệt mua sắm thiết bị văn phòng"></div>'
    + '<div class="field full"><label>Căn cứ</label>'
    +   '<textarea id="ttCanCu" rows="3" placeholder="Căn cứ quy định, kế hoạch, chỉ đạo... mỗi căn cứ một dòng"></textarea></div>'
    + '<div class="field full"><label class="lb-ai">Nội dung *'
    +   '<button type="button" class="ai-btn" onclick="openAIViet()">✨ AI viết</button></label>'
    +   '<textarea id="ttNoiDung" rows="6" placeholder="Nhập tay, hoặc bấm ✨ AI viết rồi chỉ cần nêu vài ý chính"></textarea>'
    +   '<span class="small muted" id="ttAIGhi"></span></div>'
    + '<div class="field"><label>Mức độ ưu tiên</label><select id="ttMucDo">'
    +   opt(['Thấp','Trung bình','Cao','Khẩn cấp'], 'Trung bình') + '</select></div>'
    + '<div class="field"><label>Hạn xử lý mong muốn</label><input id="ttHanChot" type="date" value="' + today() + '"></div>'
    + '<div class="field"><label>Lĩnh vực</label><select id="ttLinhVuc">' + opt(cfgList('LinhVuc'), 'Chưa phân loại') + '</select></div>'
    + khoiTepMoi()
    + '</div>'
    + '<div class="nhac">📌 Tờ trình tạo xong <b>nằm ở chỗ bạn</b>. Bạn chủ động hai thao tác: '
    + 'kéo thẻ đổi trạng thái ở tab <b>Kanban</b>, và bấm <b>Chuyển tiếp</b> để gửi cho người xử lý tiếp. '
    + 'Phần trao đổi và chuỗi liên thông dùng chung với công việc thường.</div>'
    + '<div class="modal-foot"><button class="btn" onclick="closeModal()">Huỷ</button>'
    + '<button class="btn primary" onclick="luuToTrinh()">Tạo tờ trình</button></div>');
    veTepMoi();
  });
}

/* --- Trợ lý AI viết nội dung --- */
function openAIViet(){
  var v = function(x){ var e = document.getElementById(x); return e ? e.value : ''; };
  var daCo = v('ttNoiDung').trim();
  // Giữ lại dữ liệu form để mở lại đúng chỗ sau khi đóng hộp thoại AI
  S.ttTam = { kinhTrinh: v('ttKinhTrinh'), veViec: v('ttVeViec'), canCu: v('ttCanCu'),
              noiDung: daCo, boPhan: v('ttBoPhan'), mucDo: v('ttMucDo'),
              linhVuc: v('ttLinhVuc'), hanChot: v('ttHanChot') };

  openModal('<h3>✨ AI viết nội dung tờ trình</h3>'
  + '<p class="muted small">Bạn chỉ cần nêu vài ý trọng yếu, AI dựng thành đoạn văn hành chính. '
  + '<b>Bản nháp luôn sửa được</b> — AI không tự gửi đi đâu cả.</p>'
  + (daCo ? '<div class="nhac">Bạn đã có nội dung. Chọn <b>Biên tập lại</b> để AI trau chuốt bản hiện có, '
          + 'hoặc nêu ý mới để viết lại từ đầu.</div>' : '')
  + '<div class="field"><label>Về việc</label><input value="' + esc(S.ttTam.veViec || '(chưa nhập)') + '" disabled></div>'
  + '<div class="field"><label>Các ý trọng yếu *</label>'
  +   '<textarea id="aiY" rows="7" placeholder="Mỗi ý một dòng, ví dụ:\n- 5 máy tính phòng Kế toán hết khấu hao\n- Đề xuất thay mới, dự toán 120 triệu\n- Nguồn: ngân sách đầu tư 2026\n- Mong duyệt trước 15/10">'
  +   esc(daCo) + '</textarea>'
  +   '<span class="small muted">AI không bịa số liệu. Thiếu gì nó để dấu [...] cho bạn điền.</span></div>'
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="moLaiFormToTrinh()">Quay lại</button>'
  +   (daCo ? '<button class="btn" onclick="chayAI(true)">Biên tập lại bản hiện có</button>' : '')
  +   '<button class="btn primary" id="aiNut" onclick="chayAI(false)">Viết bản nháp</button>'
  + '</div><div id="aiKetQua"></div>');
}

function chayAI(bienTap){
  var y = document.getElementById('aiY').value.trim();
  if (y.length < 10){ toast('Nêu rõ hơn các ý chính'); return; }
  var nut = document.getElementById('aiNut');
  nut.disabled = true; nut.textContent = 'AI đang viết...';
  call('apiAIVietToTrinh', [S.token, {
    yChinh: y, noiDungHienCo: bienTap ? y : '',
    veViec: S.ttTam.veViec, canCu: S.ttTam.canCu,
    kinhTrinh: S.ttTam.kinhTrinh, boPhan: S.ttTam.boPhan, mucDo: S.ttTam.mucDo
  }], function(r){
    nut.disabled = false; nut.textContent = 'Viết bản nháp';
    if (!r.ok){ document.getElementById('aiKetQua').innerHTML =
      '<div class="nhac xong" style="border-left-color:var(--danger)">⚠️ ' + esc(r.msg) + '</div>'; return; }
    S.ttTam.noiDung = r.text;
    document.getElementById('aiKetQua').innerHTML =
      '<div class="field" style="margin-top:14px"><label>Bản nháp AI viết — sửa thoải mái trước khi dùng</label>'
      + '<textarea id="aiKq" rows="10">' + esc(r.text) + '</textarea></div>'
      + '<div class="small muted">Đã dùng ' + r.daDung + '/' + r.gioiHan + ' lượt hôm nay · '
      + r.tokenVao + ' token vào, ' + r.tokenRa + ' token ra</div>'
      + '<div class="modal-foot"><button class="btn" onclick="chayAI(false)">Viết lại</button>'
      + '<button class="btn primary" onclick="dungBanNhap()">Dùng bản này</button></div>';
  });
}

function dungBanNhap(){
  S.ttTam.noiDung = document.getElementById('aiKq').value;
  moLaiFormToTrinh();
  toast('Đã đưa bản nháp vào ô Nội dung');
}

/** Mở lại form tờ trình và đổ lại dữ liệu đang soạn dở */
function moLaiFormToTrinh(){
  var d = S.ttTam || {};
  openToTrinhForm();
  setTimeout(function(){
    var dat = function(id, val){ var e = document.getElementById(id); if (e && val) e.value = val; };
    dat('ttKinhTrinh', d.kinhTrinh); dat('ttVeViec', d.veViec); dat('ttCanCu', d.canCu);
    dat('ttNoiDung', d.noiDung); dat('ttBoPhan', d.boPhan); dat('ttMucDo', d.mucDo);
    dat('ttLinhVuc', d.linhVuc); dat('ttHanChot', d.hanChot);
  }, 450);
}

function gioHienTai(){
  var d = new Date(), hai = function(n){ return (n<10?'0':'')+n; };
  return hai(d.getDate())+'/'+hai(d.getMonth()+1)+'/'+d.getFullYear()+' '+hai(d.getHours())+':'+hai(d.getMinutes());
}

function luuToTrinh(){
  var v = function(x){ return document.getElementById(x).value; };
  if (!v('ttKinhTrinh').trim()){ toast('Nhập mục "Kính trình"'); return; }
  if (!v('ttVeViec').trim()){ toast('Nhập mục "Về việc"'); return; }
  if (!v('ttNoiDung').trim()){ toast('Nhập Nội dung tờ trình'); return; }
  call('apiCreateToTrinh', [S.token, {
    KinhTrinh: v('ttKinhTrinh').trim(), VeViec: v('ttVeViec').trim(),
    CanCu: v('ttCanCu'), NoiDung: v('ttNoiDung'),
    BoPhanTrinh: v('ttBoPhan'), MucDo: v('ttMucDo'), LinhVuc: v('ttLinhVuc'),
    HanChot: v('ttHanChot')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    taiKhayLen(r.id, function(){
      closeModal();
      toast('Đã tạo ' + r.so + ' — kéo trên Kanban hoặc bấm Chuyển tiếp để gửi đi');
      reload();
    });
  });
}

/* --- Bản trình bày để đọc và in --- */
function xemToTrinh(id){
  var t = S.tasks.filter(function(x){ return x.ID === id; })[0];
  if (!t) return;
  S.xemQuayLai = S.formDangMo;      // mở từ trong form thì lát quay lại đúng form
  var canCu = String(t.CanCu||'').split('\n').filter(function(x){ return x.trim(); });
  openModal('<div id="banIn" class="to-trinh">'
  + '<div class="tt-head"><div><b>' + esc(t.BoPhanTrinh || t.BoPhan) + '</b>'
  +   '<div class="small">Số: ' + esc(t.SoToTrinh || '—') + '</div></div>'
  +   '<div class="tt-qh"><b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b>'
  +   '<div>Độc lập - Tự do - Hạnh phúc</div>'
  +   '<div class="small" style="margin-top:6px">Ngày ' + esc(String(t.NgayTao).slice(0,10)) + '</div></div></div>'
  + '<h2 class="tt-title">TỜ TRÌNH</h2>'
  + '<p class="tt-veviec"><b>V/v:</b> ' + esc(t.TenCongViec) + '</p>'
  + '<p class="tt-kg"><b>Kính trình:</b> ' + esc(t.KinhTrinh || t.PhuTrach) + '</p>'
  + (canCu.length ? '<div class="tt-sec"><b>Căn cứ:</b><ul>'
      + canCu.map(function(x){ return '<li>' + esc(x.trim()) + '</li>'; }).join('') + '</ul></div>' : '')
  + '<div class="tt-sec"><b>Nội dung:</b><div class="tt-nd">' + esc(t.MoTa).replace(/\n/g,'<br>') + '</div></div>'
  + '<div class="tt-ky"><div><i class="small">Mức độ: ' + esc(t.MucDo)
  +   ' · Trạng thái: ' + esc(t.TrangThai) + '</i></div>'
  +   '<div class="tt-ky-box"><b>NGƯỜI TRÌNH</b><div class="small">' + esc(t.NguoiGiao) + '</div></div></div>'
  + '</div>'
  + '<div class="no-print small muted" style="margin-top:12px">'
  +   '💡 Muốn ra file PDF: bấm <b>In / Xuất PDF</b> rồi ở ô <b>Máy in</b> chọn '
  +   '<b>Lưu dưới dạng PDF</b> (Save as PDF).</div>'
  + '<div class="modal-foot no-print">'
  + (S.xemQuayLai ? '' : '<button class="btn" onclick="openTaskForm(\'' + id + '\')">Mở để xử lý</button>')
  + '<button class="btn" onclick="dongKhungXem()">' + (S.xemQuayLai ? '← Quay lại' : 'Đóng') + '</button>'
  + '<button class="btn primary" onclick="inToTrinh()">🖨 In / Xuất PDF</button></div>');
}

function inToTrinh(){
  try { window.print(); }
  catch(e){ toast('Trình duyệt chặn in. Bấm Ctrl+P (Cmd+P trên Mac) để in.'); }
}

/* --- Duyệt / trả lại, hiện trong form khi mở một tờ trình --- */
/** Khối riêng của tờ trình trong form.
 *  In LUÔN hiện ở mọi trạng thái, kể cả đã Hoàn thành — in là thao tác chỉ đọc.
 *  Duyệt / Trả lại mới là phần phụ thuộc trạng thái và quyền. */
function khoiToTrinh(t){
  if (!laToTrinh(t)) return '';

  var xong = t.TrangThai === 'Hoàn thành';
  var duyetDuoc = !xong && coTheDoiTT(t) && t.PhuTrach !== t.NguoiGiao;

  var nhac = duyetDuoc
    ? '<div class="nhac">' + iconToTrinh(15) + ' Bạn đang giữ tờ trình <b>' + esc(t.SoToTrinh) + '</b>.</div>'
    : (xong ? '<div class="nhac xong">📄 Tờ trình <b>' + esc(t.SoToTrinh)
              + '</b> đã hoàn tất. Vẫn in và xuất PDF được.</div>' : '');

  return nhac
   + '<div class="modal-foot" style="justify-content:flex-start;margin-top:8px">'
   + (duyetDuoc
       ? '<button class="btn primary" onclick="openDuyet(\'' + t.ID + '\',\'Duyệt\')">✅ Duyệt</button>'
       + '<button class="btn danger" onclick="openDuyet(\'' + t.ID + '\',\'Trả lại\')">↩️ Trả lại</button>'
       : '')
   + '<button class="btn" onclick="xemToTrinh(\'' + t.ID + '\')">🖨 In / Xuất PDF</button></div>';
}

function openDuyet(id, quyetDinh){
  var duyet = quyetDinh === 'Duyệt';
  openModal('<h3>' + (duyet ? '✅ Duyệt tờ trình' : '↩️ Trả lại tờ trình') + '</h3>'
  + '<p class="muted small">' + (duyet
      ? 'Duyệt xong tờ trình chuyển sang <b>Đang làm</b> để còn chuyển tiếp bộ phận thực hiện. '
        + 'Quy trình chỉ kết thúc khi có người đặt <b>Hoàn thành</b>.'
      : 'Tờ trình quay lại người trình ở trạng thái <b>Cần làm</b> để chỉnh sửa và trình lại.') + '</p>'
  + '<div class="field"><label>Ý kiến ' + (duyet ? '(không bắt buộc)' : '— nêu rõ lý do') + '</label>'
  +   '<textarea id="dtYKien" rows="3"></textarea></div>'
  + '<div class="modal-foot"><button class="btn" onclick="openTaskForm(\'' + id + '\')">Quay lại</button>'
  + '<button class="btn ' + (duyet ? 'primary' : 'danger') + '" onclick="doDuyet(\'' + id + '\',\''
  +   quyetDinh + '\')">' + esc(quyetDinh) + '</button></div>');
}

function doDuyet(id, quyetDinh){
  var yKien = document.getElementById('dtYKien').value.trim();
  if (quyetDinh !== 'Duyệt' && !yKien){ toast('Nêu lý do trả lại để người trình biết đường sửa'); return; }
  call('apiDuyetToTrinh', [S.token, id, quyetDinh, yKien], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast(quyetDinh === 'Duyệt' ? 'Đã duyệt' : 'Đã trả lại'); reload();
  });
}
/* ============ 13. HUY HIỆU PHẠM VI ============ */
function huyHieuPhamVi(t){
  var pv = t.PhamVi || 'Chung';
  if (pv === 'Chung') return '';               // mặc định thì không cần nhắc
  return ' <span class="pv-chip" title="' + (pv === 'Cá nhân'
      ? 'Chỉ người phụ trách, người giao và người theo dõi nhìn thấy'
      : 'Chỉ phòng ' + esc(t.BoPhan || '') + ' nhìn thấy') + '">'
    + (pv === 'Cá nhân'
      ? '<i class="ico ico-mo">' + ic('khoa',11) + '</i> Cá nhân'
      : '<i class="ico ico-mo">' + ic('toanha',11) + '</i> ' + esc(t.BoPhan || 'Phòng ban')) + '</span>';
}

/* =========================================================
   ĐĂNG KÝ XE
   Phiếu đặt xe là một task (Loai = 'Đăng ký xe'); chi tiết
   chuyến lấy riêng từ apiXeDanhMuc rồi ghép theo TaskID.
   ========================================================= */

var XE_GIO_DAU = 6, XE_GIO_CUOI = 20;         // khung giờ vẽ trên lịch
var XE_MAU_XN  = { 'Chờ':'#f59e0b', 'Đã nhận':'#10b981', 'Từ chối':'#ef4444' };

function viewXe(){
  var tab = S.xeTab || 'lich';
  var nut = function(k, t){
    return '<button class="btn sm' + (tab === k ? ' primary' : '') + '"'
      + ' onclick="doiXeTab(\'' + k + '\')">' + t + '</button>';
  };
  return '<div class="card"><h3 class="tab-dau" style="justify-content:space-between">🚗 Đăng ký xe'
    + '<span class="tab-nhom">'
    +   nut('lich','Lịch xe') + nut('phieu','Phiếu') + nut('doixe','Đội xe & tuyến')
    +   nut('chiphi','Chi phí & bảo dưỡng')
    +   (chiDoc() ? '' : '<button class="btn primary sm" onclick="openDatXeForm()">+ Đặt xe</button>')
    + '</span></h3>'
    + '<div id="xeBox">' + khungCho(4) + '</div></div>';
}

function doiXeTab(k){ S.xeTab = k; veXeTab(); }

function loadXe(){
  call('apiXeDanhMuc', [S.token], function(r){
    if (!r || !r.ok) return;
    S.xe = r;
    veXeTab();
  });
}

function phieuTheoTask(taskId){
  return (S.xe && S.xe.phieu || []).filter(function(p){
    return String(p.TaskID) === String(taskId); })[0];
}
function xeTheoId(id){
  return (S.xe && S.xe.xe || []).filter(function(x){ return String(x.ID) === String(id); })[0];
}
function tenXe(id){ var x = xeTheoId(id); return x ? x.BienSo : ''; }

/** Ghép phiếu với task tương ứng. Phiếu không có task (task bị xoá) thì bỏ qua. */
function dsPhieuXe(){
  var tasks = {};
  S.tasks.forEach(function(t){ tasks[String(t.ID)] = t; });
  return (S.xe && S.xe.phieu || []).map(function(p){
    var t = tasks[String(p.TaskID)];
    return t ? { p: p, t: t } : null;
  }).filter(Boolean).sort(function(a, b){
    return a.p.GioDi < b.p.GioDi ? 1 : -1;      // mới nhất lên trước
  });
}

function veXeTab(){
  var box = document.getElementById('xeBox');
  if (!box) return;
  box.classList.remove('muted');
  if (!S.xe){ box.innerHTML = khungCho(4); return; }
  var tab = S.xeTab || 'lich';
  box.innerHTML = nhacChoDuyet() + (tab === 'lich' ? veLichXe()
                : tab === 'phieu' ? veDsPhieu()
                : tab === 'chiphi' ? veChiPhi() : veDoiXe());
  donIcon(box);
  if (tab === 'chiphi') loadBaoCaoXe();
}

/** Phiếu chưa chốt xe thì chưa nằm trên lịch, nên phải có chỗ nhắc
 *  không thì người điều xe không biết là có việc đang chờ mình. */
function nhacChoDuyet(){
  if (!S.xe || !S.xe.dieuXeDuoc) return '';
  var cho = dsPhieuXe().filter(function(o){
    return !o.p.XeID && o.t.TrangThai !== 'Hoàn thành'; });
  var tuChoi = dsPhieuXe().filter(function(o){
    return o.p.XeID && o.p.TaiXeXacNhan === 'Từ chối' && o.t.TrangThai !== 'Hoàn thành'; });
  if (!cho.length && !tuChoi.length) return '';

  var dong = function(ds, nhan){
    if (!ds.length) return '';
    return '<div class="xe-nhac-dong"><b>' + ds.length + ' phiếu</b> ' + nhan
      + ds.slice(0, 4).map(function(o){
          return ' <button class="btn sm" onclick="moPhieuXe(\'' + o.t.ID + '\')">'
            + esc(o.p.SoPhieu) + ' · ' + esc(o.p.MucDich.slice(0, 28)) + '</button>';
        }).join('')
      + (ds.length > 4 ? ' <span class="muted small">và ' + (ds.length - 4) + ' phiếu nữa</span>' : '')
      + '</div>';
  };
  return '<div class="xe-nhac">'
    + dong(cho, 'đang chờ bạn chốt xe:')
    + dong(tuChoi, 'bị lái xe từ chối, cần bố trí lại:')
    + '</div>';
}

/* ---------- Lịch xe ---------- */

function veLichXe(){
  var ds = S.xe.xe.filter(function(x){ return x.TrangThai !== 'Ngừng dùng'; });
  if (!ds.length){
    return '<p class="muted">Chưa khai báo xe nào. Vào tab <b>Đội xe &amp; tuyến</b> để thêm xe.</p>';
  }
  var ngay = S.xeNgay || today();
  var gio = '';
  for (var h = XE_GIO_DAU; h <= XE_GIO_CUOI; h++){
    // Mốc đầu và cuối canh vào trong, nếu căn giữa thì bị cắt mất nửa nhãn
    var lech = h === XE_GIO_DAU ? '0' : (h === XE_GIO_CUOI ? '-100%' : '-50%');
    gio += '<span class="xe-moc" style="left:' + pcXe(h * 60)
         + '%;transform:translateX(' + lech + ')">' + h + 'h</span>';
  }

  var cacPhieu = dsPhieuXe().filter(function(o){
    return o.p.GioDi.slice(0, 10) <= ngay && o.p.GioVe.slice(0, 10) >= ngay
        && o.t.TrangThai !== 'Hoàn thành' && o.p.XeID;
  });

  var hang = ds.map(function(x){
    var cua = cacPhieu.filter(function(o){ return String(o.p.XeID) === String(x.ID); });
    var thanh = cua.map(function(o){
      var a = gioTrongNgay(o.p.GioDi, ngay, 0), b = gioTrongNgay(o.p.GioVe, ngay, 1);
      var l = pcXe(a), w = Math.max(pcXe(b) - l, 2.5);
      var mau = XE_MAU_XN[o.p.TaiXeXacNhan] || '#64748b';
      return '<button class="xe-bar' + (o.p.TaiXeXacNhan === 'Chờ' ? ' cho' : '') + '"'
        + ' style="left:' + l + '%;width:' + w + '%;--m:' + mau + '"'
        + ' onclick="moPhieuXe(\'' + o.t.ID + '\')"'
        + ' title="' + esc(o.p.SoPhieu + ' · ' + o.p.MucDich + '\n'
            + o.p.GioDi.slice(11) + '–' + o.p.GioVe.slice(11)
            + '\nLái xe: ' + (o.p.TaiXe || '—') + ' · ' + o.p.TaiXeXacNhan) + '">'
        + '<b>' + esc(o.p.DiemDen) + '</b> <span>' + esc(o.t.NguoiGiao) + '</span></button>';
    }).join('');

    var bd = x.TrangThai === 'Đang bảo dưỡng'
      ? '<div class="xe-baoduong">đang bảo dưỡng</div>' : '';

    return '<div class="xe-hang">'
      + '<div class="xe-ten"><b>' + esc(x.BienSo) + '</b>'
      +   '<small>' + esc([x.Ten, moTaLoaiXe(x)].filter(Boolean).join(' · ')) + '</small>'
      +   (x.TaiXe ? '<small>' + avatarHtml(x.TaiXe) + ' ' + esc(x.TaiXe) + '</small>' : '')
      + '</div>'
      + '<div class="xe-track">' + bd + thanh + '</div></div>';
  }).join('');

  var trong = cacPhieu.length ? '' :
    '<p class="muted small" style="padding:10px 0">Ngày này chưa có chuyến nào đã chốt xe.</p>';

  return '<div class="xe-dieu">'
    + '<button class="btn sm" onclick="xeDoiNgay(-1)">‹ Hôm trước</button>'
    + '<b>' + ngayDaiVN(ngay) + '</b>'
    + '<button class="btn sm" onclick="xeDoiNgay(1)">Hôm sau ›</button>'
    + '<button class="btn sm" onclick="xeVeHomNay()">Hôm nay</button>'
    + '<span class="xe-chu"><i class="xe-o" style="background:#10b981"></i>đã nhận'
    +   '<i class="xe-o" style="background:#f59e0b"></i>chờ lái xe xác nhận</span>'
    + '</div>'
    + '<div class="scroll-x"><div class="xe-lich">'
    +   '<div class="xe-hang xe-dau"><div class="xe-ten"></div>'
    +     '<div class="xe-track">' + gio + '</div></div>'
    +   hang
    + '</div></div>' + trong;
}

/** Vị trí theo phần trăm chiều ngang của mốc phút trong ngày */
function pcXe(phut){
  var d = XE_GIO_DAU * 60, c = XE_GIO_CUOI * 60;
  return Math.max(0, Math.min(100, (phut - d) / (c - d) * 100));
}

/** Phút trong ngày của một mốc thời gian, cắt về đầu/cuối ngày nếu chuyến kéo nhiều ngày */
function gioTrongNgay(dt, ngay, laCuoi){
  var d = String(dt).slice(0, 10);
  if (d < ngay) return XE_GIO_DAU * 60;
  if (d > ngay) return XE_GIO_CUOI * 60;
  var hm = String(dt).slice(11, 16).split(':');
  var p = Number(hm[0]) * 60 + Number(hm[1] || 0);
  return laCuoi ? Math.max(p, XE_GIO_DAU * 60 + 15) : p;
}

var TEN_THU_VN = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
function ngayDaiVN(s){
  var p = String(s).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return TEN_THU_VN[d.getDay()] + ', ' + p[2] + '/' + p[1] + '/' + p[0];
}
function xeDoiNgay(n){
  var p = String(S.xeNgay || today()).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  S.xeNgay = lymd(d); veXeTab();
}
function xeVeHomNay(){ S.xeNgay = today(); veXeTab(); }

/* ---------- Danh sách phiếu ---------- */

/** Phiếu xe trên điện thoại: lái xe hay xem ngoài đường nên bỏ bảng 10 cột,
 *  đổi thành thẻ, số phiếu và trạng thái xác nhận nằm ngay dòng đầu. */
function veDsPhieuMobile(ds){
  return '<div class="the-ds">' + ds.map(function(o){
    var p = o.p, t = o.t;
    var km = (p.KmCuoi || 0) - (p.KmDau || 0);
    var tien = (p.ChiPhiXang || 0) + (p.ChiPhiCauDuong || 0) + (p.ChiPhiKhac || 0);
    return '<div class="the-o" onclick="moPhieuXe(\'' + t.ID + '\')">'
      + '<div class="the-dau"><b class="mono-so">' + esc(p.SoPhieu) + '</b>'
      +   chip(t.TrangThai, MAU_TT[t.TrangThai] || '#94a3b8')
      +   (t.TrangThai !== 'Hoàn thành' && p.XeID
            ? chip(p.TaiXeXacNhan, XE_MAU_XN[p.TaiXeXacNhan] || '#94a3b8') : '')
      + '</div>'
      + '<div class="the-phu"><b style="font-size:14.5px">' + esc(p.MucDich) + '</b><br>'
      +   esc(p.DiemDon ? p.DiemDon + ' → ' + p.DiemDen : p.DiemDen) + '</div>'
      + '<div class="the-hang"><span class="mono-so">'
      +   '<i class="ico ico-mo">' + ic('lich',12) + '</i> '
      +   esc(p.GioDi.slice(5).replace('-','/')) + ' → ' + esc(p.GioVe.slice(5).replace('-','/')) + '</span></div>'
      + '<div class="the-hang">'
      +   '<span class="nhan">Người đặt</span>' + avatarHtml(t.NguoiGiao) + esc(t.NguoiGiao) + '</div>'
      + '<div class="the-hang">'
      +   '<span class="nhan">Xe</span>' + (p.XeID ? esc(tenXe(p.XeID)) : '<span class="muted">chưa chốt</span>')
      +   '<span class="nhan">Lái xe</span>' + (p.TaiXe ? avatarHtml(p.TaiXe) + esc(p.TaiXe) : '—')
      + '</div>'
      + (S.xe.theoDoiKm && (km > 0 || tien > 0)
          ? '<div class="the-hang">'
            + (km > 0 ? '<span class="nhan">Km</span><span class="mono-so">' + km + '</span>' : '')
            + (tien > 0 ? '<span class="nhan">Chi phí</span><span class="mono-so">' + tien.toLocaleString('vi-VN') + '</span>' : '')
            + '</div>'
          : '')
      + '<div class="the-chan" onclick="event.stopPropagation()">'
      +   (S.soBinhLuan[t.ID]
            ? '<span class="nhan"><i class="ico ico-mo">' + ic('chat',12) + '</i> ' + S.soBinhLuan[t.ID] + '</span>' : '')
      +   '<button class="btn primary day" onclick="moPhieuXe(\'' + t.ID + '\')">Mở phiếu</button>'
      + '</div>'
      + '</div>';
  }).join('') + '</div>';
}

function veDsPhieu(){
  var ds = dsPhieuXe();
  if (!ds.length) return '<p class="muted">Chưa có phiếu đặt xe nào.</p>';
  if (laDienThoai()) return veDsPhieuMobile(ds);

  return '<div class="scroll-x"><table>'
    + '<tr><th>Số phiếu</th><th>Mục đích</th><th>Người đặt</th><th>Giờ đi → về</th>'
    + '<th>Xe</th><th>Lái xe</th><th>Trạng thái</th>'
    + (S.xe.theoDoiKm ? '<th>Km</th><th>Chi phí</th>' : '') + '<th></th></tr>'
    + ds.map(function(o){
        var p = o.p, t = o.t;
        var km = (p.KmCuoi || 0) - (p.KmDau || 0);
        var tien = (p.ChiPhiXang || 0) + (p.ChiPhiCauDuong || 0) + (p.ChiPhiKhac || 0);
        return '<tr>'
          + '<td><b class="mono-so">' + esc(p.SoPhieu) + '</b>'
          +   (S.soBinhLuan[t.ID]
                ? ' <span class="cmt-badge">💬 ' + S.soBinhLuan[t.ID] + '</span>' : '') + '</td>'
          + '<td>' + esc(p.MucDich) + '<br><span class="muted small">'
          +   esc(p.DiemDon ? p.DiemDon + ' → ' + p.DiemDen : p.DiemDen) + '</span></td>'
          + '<td>' + avatarHtml(t.NguoiGiao) + ' ' + esc(t.NguoiGiao) + '</td>'
          + '<td class="mono-so">' + esc(p.GioDi.slice(5).replace('-','/')) + '<br>'
          +   esc(p.GioVe.slice(5).replace('-','/')) + '</td>'
          + '<td>' + (p.XeID ? esc(tenXe(p.XeID)) : '<span class="muted">chưa chốt</span>') + '</td>'
          + '<td>' + (p.TaiXe ? avatarHtml(p.TaiXe) + ' ' + esc(p.TaiXe) : '—') + '</td>'
          + '<td>' + chip(t.TrangThai, MAU_TT[t.TrangThai] || '#94a3b8')
          +   (t.TrangThai !== 'Hoàn thành' && p.XeID
                ? ' ' + chip(p.TaiXeXacNhan, XE_MAU_XN[p.TaiXeXacNhan] || '#94a3b8') : '') + '</td>'
          + (S.xe.theoDoiKm
              ? '<td class="mono-so">' + (km > 0 ? km : '—') + '</td>'
              + '<td class="mono-so">' + (tien > 0 ? tien.toLocaleString('vi-VN') : '—') + '</td>'
              : '')
          + '<td><button class="btn sm" onclick="moPhieuXe(\'' + t.ID + '\')">Mở</button></td>'
          + '</tr>';
      }).join('')
    + '</table></div>';
}

/* ---------- Đội xe và tuyến ---------- */

function veDoiXe(){
  var sua = S.xe.dieuXeDuoc;
  var xe = S.xe.xe, tu = S.xe.tuyen;

  // Gộp cột cho bảng đỡ rộng: 11 cột thì cột thao tác bị đẩy khuất khỏi màn hình
  var hanXe = function(nhan, d){
    if (!d) return '';
    return '<div class="small' + (hetHanGan(d) ? ' xe-sap-han' : ' muted') + '">'
      + nhan + ' ' + esc(d) + '</div>';
  };
  var bangXe = !xe.length
    ? '<p class="muted">Chưa có xe nào.</p>'
    : laDienThoai()
    ? '<div class="the-ds">' + xe.map(function(x){
        return '<div class="the-o">'
          + '<div class="the-dau"><b>' + esc(x.BienSo) + '</b>'
          +   chip(x.TrangThai, x.TrangThai === 'Sẵn sàng' ? '#10b981'
                : (x.TrangThai === 'Đang bảo dưỡng' ? '#f59e0b' : '#94a3b8')) + '</div>'
          + '<div class="the-phu">' + esc(x.Ten || '—') + ' · ' + esc(moTaLoaiXe(x)) + '</div>'
          + '<div class="the-hang"><span class="nhan">Lái xe</span>'
          +   (x.TaiXe ? avatarHtml(x.TaiXe) + esc(x.TaiXe) : '—')
          +   (x.SoDienThoai ? '<a href="tel:' + esc(x.SoDienThoai) + '">' + esc(x.SoDienThoai) + '</a>' : '')
          + '</div>'
          + '<div class="the-hang"><span class="nhan">Cho đi thế</span>' + (x.ChoDiThe ? 'Có' : 'Không') + '</div>'
          + ((x.HanDangKiem || x.HanBaoHiem)
              ? '<div class="the-hang">' + hanXe('Đăng kiểm', x.HanDangKiem) + hanXe('Bảo hiểm', x.HanBaoHiem) + '</div>'
              : '')
          + (sua ? '<div class="the-chan">'
              + '<button class="btn" onclick="openXeForm(\'' + x.ID + '\')">Sửa</button>'
              + '<button class="btn day" onclick="xoaXe(\'' + x.ID + '\')">Xoá</button></div>' : '')
          + '</div>';
      }).join('') + '</div>'
    : '<div class="scroll-x"><table>'
      + '<tr><th>Biển số</th><th>Xe</th><th>Lái xe</th><th>Đi thế</th>'
      + '<th>Hạn</th><th>Trạng thái</th>' + (sua ? '<th></th>' : '') + '</tr>'
      + xe.map(function(x){
          return '<tr><td><b>' + esc(x.BienSo) + '</b></td>'
            + '<td>' + esc(x.Ten || '—')
            +   '<div class="small muted">'
            +   esc(moTaLoaiXe(x)) + '</div></td>'
            + '<td>' + (x.TaiXe ? avatarHtml(x.TaiXe) + ' ' + esc(x.TaiXe) : '—')
            +   (x.SoDienThoai ? '<div class="small muted">' + esc(x.SoDienThoai) + '</div>' : '') + '</td>'
            + '<td>' + (x.ChoDiThe ? 'Có' : 'Không') + '</td>'
            + '<td>' + (hanXe('Đăng kiểm', x.HanDangKiem) + hanXe('Bảo hiểm', x.HanBaoHiem) || '—') + '</td>'
            + '<td>' + chip(x.TrangThai, x.TrangThai === 'Sẵn sàng' ? '#10b981'
                : (x.TrangThai === 'Đang bảo dưỡng' ? '#f59e0b' : '#94a3b8')) + '</td>'
            + (sua ? '<td style="white-space:nowrap">'
                + '<button class="btn sm" onclick="openXeForm(\'' + x.ID + '\')">Sửa</button> '
                + '<button class="btn sm" onclick="xoaXe(\'' + x.ID + '\')">Xoá</button></td>' : '')
            + '</tr>';
        }).join('') + '</table></div>';

  var bangTuyen = !tu.length
    ? '<p class="muted">Chưa ghim tuyến nào. Ghim tuyến để người đặt xe chỉ cần chọn tuyến '
      + 'là hệ thống tự điền xe, lái xe và giờ.</p>'
    : laDienThoai()
    ? '<div class="the-ds">' + tu.map(function(r){
        return '<div class="the-o">'
          + '<div class="the-dau"><b>' + esc(r.TenTuyen) + '</b>'
          +   chip(r.TrangThai, r.TrangThai === 'Đang chạy' ? '#10b981' : '#94a3b8') + '</div>'
          + '<div class="the-phu">' + esc((r.DiemDi || '—') + ' → ' + r.DiemDen) + '</div>'
          + '<div class="the-hang"><span class="nhan">Xe ghim</span>' + esc(tenXe(r.XeGhim) || '—')
          +   '<span class="nhan">Lái xe</span>'
          +   (r.TaiXeGhim ? avatarHtml(r.TaiXeGhim) + esc(r.TaiXeGhim) : '—') + '</div>'
          + '<div class="the-hang">'
          +   '<span class="nhan">Ngày</span><span>' + esc(moTaNgayTuyen(r.CacNgay)) + '</span>'
          +   '<span class="nhan">Giờ</span><span class="mono-so">'
          +     esc((r.GioDi || '—') + '–' + (r.GioVe || '—')) + '</span>'
          +   (r.KmUocTinh ? '<span class="nhan">Km</span><span class="mono-so">' + r.KmUocTinh + '</span>' : '')
          + '</div>'
          + (sua ? '<div class="the-chan">'
              + '<button class="btn" onclick="openTuyenForm(\'' + r.ID + '\')">Sửa</button>'
              + '<button class="btn day" onclick="xoaTuyen(\'' + r.ID + '\')">Xoá</button></div>' : '')
          + '</div>';
      }).join('') + '</div>'
    : '<div class="scroll-x"><table>'
      + '<tr><th>Tuyến</th><th>Điểm đi → đến</th><th>Xe ghim</th><th>Lái xe</th>'
      + '<th>Ngày</th><th>Giờ</th><th>Km</th><th>Trạng thái</th>' + (sua ? '<th></th>' : '') + '</tr>'
      + tu.map(function(r){
          return '<tr><td><b>' + esc(r.TenTuyen) + '</b></td>'
            + '<td class="small">' + esc((r.DiemDi || '—') + ' → ' + r.DiemDen) + '</td>'
            + '<td>' + esc(tenXe(r.XeGhim) || '—') + '</td>'
            + '<td>' + (r.TaiXeGhim ? avatarHtml(r.TaiXeGhim) + ' ' + esc(r.TaiXeGhim) : '—') + '</td>'
            + '<td class="small">' + esc(moTaNgayTuyen(r.CacNgay)) + '</td>'
            + '<td class="mono-so">' + esc((r.GioDi || '—') + '–' + (r.GioVe || '—')) + '</td>'
            + '<td class="mono-so">' + (r.KmUocTinh || '—') + '</td>'
            + '<td>' + chip(r.TrangThai, r.TrangThai === 'Đang chạy' ? '#10b981' : '#94a3b8') + '</td>'
            + (sua ? '<td style="white-space:nowrap">'
                + '<button class="btn sm" onclick="openTuyenForm(\'' + r.ID + '\')">Sửa</button> '
                + '<button class="btn sm" onclick="xoaTuyen(\'' + r.ID + '\')">Xoá</button></td>' : '')
            + '</tr>';
        }).join('') + '</table></div>';

  return '<h3 style="justify-content:space-between;margin-top:4px">🚗 Đội xe'
    +   (sua ? '<button class="btn primary sm" onclick="openXeForm()">+ Thêm xe</button>' : '') + '</h3>'
    + bangXe
    + '<h3 style="justify-content:space-between;margin-top:22px">🛣 Tuyến ghim sẵn'
    +   (sua ? '<button class="btn primary sm" onclick="openTuyenForm()">+ Thêm tuyến</button>' : '') + '</h3>'
    + bangTuyen
    + (sua ? '' : '<p class="muted small" style="margin-top:14px">Chỉ bộ phận '
        + esc(S.xe.boPhanDieuXe) + ', Quản lý và Admin mới sửa được phần này.</p>');
}

/** "7 chỗ" + 7 chỗ sẽ thành "7 chỗ · 7 chỗ"; bỏ phần lặp đi */
function moTaLoaiXe(x){
  var loai = String(x.Loai || '').trim();
  var cho = x.SoCho ? x.SoCho + ' chỗ' : '';
  if (cho && loai.indexOf(String(x.SoCho)) >= 0) return loai;
  return [loai, cho].filter(Boolean).join(' · ');
}

function hetHanGan(d){
  if (!d) return false;
  var con = (new Date(d + 'T00:00:00') - new Date()) / 86400000;
  return con <= 30;
}
function moTaNgayTuyen(s){
  var ds = String(s || '').split(',').filter(Boolean);
  if (!ds.length) return 'Bất kỳ';
  return ds.map(function(x){ return TEN_THU[Number(x)] || x; }).join(', ');
}

/* =========================================================
   BIỂU MẪU ĐĂNG KÝ XE
   ========================================================= */

function optUser(chon, trong){
  return '<option value="">' + (trong || '— chọn —') + '</option>'
    + S.users.filter(function(u){ return u.TrangThai !== 'Khoá'; })
        .map(function(u){
          return '<option value="' + esc(u.Ten) + '"' + (u.Ten === chon ? ' selected' : '') + '>'
            + esc(u.Ten) + (u.BoPhan ? ' · ' + esc(u.BoPhan) : '') + '</option>';
        }).join('');
}

/** Ô chọn lái xe: người đã gắn cờ Lái xe xếp lên đầu cho dễ tìm,
 *  nhưng vẫn cho chọn người khác vì có khi nhân viên tự lái. */
function optLaiXe(chon, trong){
  var ds = S.users.filter(function(u){ return u.TrangThai !== 'Khoá'; });
  var lai = ds.filter(function(u){ return u.LaLaiXe; });
  var con = ds.filter(function(u){ return !u.LaLaiXe; });
  var ve = function(u){
    return '<option value="' + esc(u.Ten) + '"' + (u.Ten === chon ? ' selected' : '') + '>'
      + esc(u.Ten) + (u.BoPhan ? ' · ' + esc(u.BoPhan) : '') + '</option>';
  };
  return '<option value="">' + (trong || '— chọn —') + '</option>'
    + (lai.length ? '<optgroup label="Lái xe">' + lai.map(ve).join('') + '</optgroup>' : '')
    + (con.length ? '<optgroup label="Nhân viên khác">' + con.map(ve).join('') + '</optgroup>' : '');
}
function optXe(chon, trong){
  return '<option value="">' + (trong || '— chọn xe —') + '</option>'
    + (S.xe && S.xe.xe || []).filter(function(x){ return x.TrangThai !== 'Ngừng dùng'; })
        .map(function(x){
          return '<option value="' + esc(x.ID) + '"' + (String(x.ID) === String(chon) ? ' selected' : '') + '>'
            + esc(x.BienSo) + (x.Ten ? ' · ' + esc(x.Ten) : '')
            + (x.SoCho ? ' · ' + x.SoCho + ' chỗ' : '')
            + (x.TrangThai === 'Đang bảo dưỡng' ? ' (đang bảo dưỡng)' : '') + '</option>';
        }).join('');
}
function vGt(id){ var e = document.getElementById(id); return e ? e.value : ''; }
/** datetime-local trả về 'YYYY-MM-DDTHH:mm', server cần 'YYYY-MM-DD HH:mm' */
function dtGui(v){ return String(v || '').replace('T', ' '); }
function dtO(v){ return String(v || '').replace(' ', 'T').slice(0, 16); }

/* ---------- Đặt xe ---------- */

function openDatXeForm(){
  if (chiXem()){ toast('Tài khoản chỉ xem không đặt được xe'); return; }
  if (!S.xe){ call('apiXeDanhMuc', [S.token], function(r){ S.xe = r; openDatXeForm(); }); return; }

  var mai = new Date(Date.now() + 86400000);
  var mac = lymd(mai);
  var tuyen = (S.xe.tuyen || []).filter(function(t){ return t.TrangThai === 'Đang chạy'; });

  openModal('<h3>🚗 Đặt xe công ty</h3>'
  + '<div class="field"><label>Chọn tuyến có sẵn</label>'
  +   '<select id="dxTuyen" onchange="datXeChonTuyen()">'
  +     '<option value="">— Chuyến lẻ, tự nhập —</option>'
  +     tuyen.map(function(t){
            return '<option value="' + esc(t.ID) + '">' + esc(t.TenTuyen)
              + ' (' + esc(t.DiemDen) + ')</option>'; }).join('')
  +   '</select>'
  +   '<div class="small muted" style="margin-top:5px">Chọn tuyến thì điểm đi, điểm đến và giờ '
  +   'tự điền sẵn; hệ thống cũng ưu tiên xe đã ghim cho tuyến đó.</div></div>'

  + '<div class="field"><label>Mục đích chuyến đi *</label>'
  +   '<input id="dxMucDich" placeholder="Ví dụ: Đi ký hợp đồng dự án Parc Ville"></div>'

  + '<div class="form-grid">'
  +   '<div class="field"><label>Điểm đón</label>'
  +     '<input id="dxDiemDon" placeholder="Văn phòng công ty"></div>'
  +   '<div class="field"><label>Điểm đến *</label>'
  +     '<input id="dxDiemDen" placeholder="Nơi cần đến"></div>'
  + '</div>'

  + '<div class="form-grid">'
  +   '<div class="field"><label>Giờ đi *</label>'
  +     '<input type="datetime-local" id="dxGioDi" value="' + mac + 'T07:30"></div>'
  +   '<div class="field"><label>Giờ về dự kiến *</label>'
  +     '<input type="datetime-local" id="dxGioVe" value="' + mac + 'T17:00"></div>'
  + '</div>'

  + '<div class="form-grid">'
  +   '<div class="field"><label>Số người đi</label>'
  +     '<input type="number" id="dxSoNguoi" min="1" value="1"></div>'
  +   '<div class="field"><label>Mức độ ưu tiên</label><select id="dxMucDo">'
  +     ['Thấp','Trung bình','Cao','Khẩn cấp'].map(function(m){
            return '<option' + (m === 'Trung bình' ? ' selected' : '') + '>' + m + '</option>';
          }).join('') + '</select></div>'
  + '</div>'

  + '<div class="field"><label>Ghi chú thêm</label>'
  +   '<textarea id="dxGhiChu" rows="2" placeholder="Cần xe rộng để chở hồ sơ, đón thêm khách ở..."></textarea></div>'

  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   '<button class="btn primary" onclick="luuDatXe()">Gửi yêu cầu</button></div>', 'ngan');
}

function datXeChonTuyen(){
  var id = vGt('dxTuyen');
  if (!id) return;
  var t = (S.xe.tuyen || []).filter(function(x){ return String(x.ID) === String(id); })[0];
  if (!t) return;
  var dat = function(el, v){ var e = document.getElementById(el); if (e && v) e.value = v; };
  dat('dxDiemDon', t.DiemDi);
  dat('dxDiemDen', t.DiemDen);
  if (!vGt('dxMucDich')) dat('dxMucDich', t.TenTuyen);
  // Giữ nguyên ngày người dùng đang chọn, chỉ thay phần giờ theo tuyến
  var ngay = String(vGt('dxGioDi') || '').slice(0, 10) || today();
  if (t.GioDi) dat('dxGioDi', ngay + 'T' + t.GioDi);
  if (t.GioVe) dat('dxGioVe', ngay + 'T' + t.GioVe);
}

function luuDatXe(){
  if (!vGt('dxMucDich').trim()){ toast('Nhập mục đích chuyến đi'); return; }
  if (!vGt('dxDiemDen').trim()){ toast('Nhập điểm đến'); return; }
  if (!vGt('dxGioDi') || !vGt('dxGioVe')){ toast('Chọn giờ đi và giờ về'); return; }

  call('apiDatXe', [S.token, {
    TuyenID: vGt('dxTuyen'), MucDich: vGt('dxMucDich').trim(),
    DiemDon: vGt('dxDiemDon').trim(), DiemDen: vGt('dxDiemDen').trim(),
    GioDi: dtGui(vGt('dxGioDi')), GioVe: dtGui(vGt('dxGioVe')),
    SoNguoi: vGt('dxSoNguoi'), MucDo: vGt('dxMucDo'),
    GhiChuChuyen: vGt('dxGhiChu')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal();
    toast('Đã gửi phiếu ' + r.so + ' tới bộ phận điều xe');
    S.view = 'xe'; S.xeTab = 'phieu';
    reload();
  });
}

/* ---------- Mở một phiếu ---------- */

function moPhieuXe(taskId){
  var p = phieuTheoTask(taskId);
  var t = S.tasks.filter(function(x){ return String(x.ID) === String(taskId); })[0];
  if (!p || !t){ toast('Không tìm thấy phiếu'); return; }

  var xe = xeTheoId(p.XeID);
  var laLaiXe  = p.TaiXe === S.me.Ten;
  var dieuDuoc = S.xe.dieuXeDuoc;
  var xong     = t.TrangThai === 'Hoàn thành';

  var dong = function(nhan, gt){
    return '<div class="xe-dong"><span class="muted">' + nhan + '</span><b>' + gt + '</b></div>';
  };

  // Phân vai rõ ràng:
  //   Bộ phận điều xe : chốt xe, đổi xe / đổi lái xe bất cứ lúc nào, trả lại, kết thúc chuyến
  //   Lái xe          : chỉ xác nhận hoặc từ chối chuyến của mình
  var quanLy = S.xe.quanLy;
  var nut = '';
  if (!xong && dieuDuoc && !p.XeID){
    nut += '<button class="btn primary" onclick="openChotXeForm(\'' + taskId + '\')">Chốt xe</button>'
         + '<button class="btn" onclick="traLaiPhieuXe(\'' + taskId + '\')">Trả lại</button>';
  }
  if (!xong && dieuDuoc && p.XeID){
    // Luôn cho đổi: lái xe từ chối, nghỉ phép, xe hỏng đột xuất đều cần đổi được
    nut += '<button class="btn' + (p.TaiXeXacNhan === 'Từ chối' ? ' primary' : '') + '"'
         + ' onclick="openChotXeForm(\'' + taskId + '\')">'
         + (p.TaiXeXacNhan === 'Từ chối' ? 'Bố trí lại' : 'Đổi xe / lái xe') + '</button>';
  }
  if (!xong && p.XeID && p.TaiXeXacNhan === 'Chờ' && (laLaiXe || quanLy)){
    nut += '<button class="btn primary" onclick="taiXeXacNhan(\'' + taskId + '\',true)">Xác nhận nhận chuyến</button>'
         + '<button class="btn" onclick="taiXeXacNhan(\'' + taskId + '\',false)">Từ chối</button>';
  }
  if (!xong && p.TaiXeXacNhan === 'Đã nhận' && dieuDuoc){
    nut += '<button class="btn primary" onclick="openChotChuyenForm(\'' + taskId + '\')">Kết thúc chuyến</button>';
  }
  if (!xong && t.NguoiGiao === S.me.Ten && !p.XeID){
    nut += '<button class="btn" onclick="huyPhieuXe(\'' + taskId + '\')">Huỷ phiếu</button>';
  }
  // Lái xe đã nhận chuyến thì không còn nút nào: nói rõ để khỏi tưởng bị lỗi
  if (!xong && laLaiXe && !dieuDuoc && !quanLy && p.TaiXeXacNhan === 'Đã nhận'){
    nut += '<span class="small muted" style="align-self:center">Đã nhận chuyến. '
         + 'Bộ phận ' + esc(S.xe.boPhanDieuXe) + ' sẽ kết thúc chuyến và ghi km.</span>';
  }

  var km = (p.KmCuoi || 0) - (p.KmDau || 0);
  var tien = (p.ChiPhiXang || 0) + (p.ChiPhiCauDuong || 0) + (p.ChiPhiKhac || 0);

  openModal('<h3>🚗 Phiếu ' + esc(p.SoPhieu) + '</h3>'
  + '<div class="xe-bang">'
  +   dong('Mục đích', esc(p.MucDich))
  +   dong('Hành trình', esc((p.DiemDon || '—') + ' → ' + p.DiemDen))
  +   dong('Giờ đi', esc(p.GioDi))
  +   dong('Giờ về dự kiến', esc(p.GioVe))
  +   dong('Số người', p.SoNguoi)
  +   dong('Người đặt', avatarHtml(t.NguoiGiao) + ' ' + esc(t.NguoiGiao))
  +   dong('Xe', xe ? esc(xe.BienSo + (xe.Ten ? ' · ' + xe.Ten : '')) : '<span class="muted">chưa chốt</span>')
  +   dong('Lái xe', p.TaiXe
        ? avatarHtml(p.TaiXe) + ' ' + esc(p.TaiXe)
          + (xe && xe.SoDienThoai ? ' <span class="muted">· ' + esc(xe.SoDienThoai) + '</span>' : '')
        : '—')
  +   dong('Trạng thái', chip(t.TrangThai, MAU_TT[t.TrangThai] || '#94a3b8')
        + (p.XeID && !xong ? ' ' + chip(p.TaiXeXacNhan, XE_MAU_XN[p.TaiXeXacNhan] || '#94a3b8') : ''))
  +   (p.LyDoDoiXe ? dong('Gợi ý của hệ thống', '<span class="muted">' + esc(p.LyDoDoiXe) + '</span>') : '')
  +   (p.LyDoTuChoi ? dong('Lái xe từ chối', '<span style="color:var(--danger)">' + esc(p.LyDoTuChoi) + '</span>') : '')
  +   (S.xe.theoDoiKm && km > 0 ? dong('Số km', km + ' km') : '')
  +   (S.xe.theoDoiKm && tien > 0 ? dong('Chi phí', tien.toLocaleString('vi-VN') + ' đ') : '')
  + '</div>'
  + khoiTraoDoi(taskId)
  + '<div class="modal-foot" style="flex-wrap:wrap">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   '<button class="btn" onclick="closeModal();openTaskForm(\'' + taskId + '\')">Mở dạng công việc</button>'
  +   nut + '</div>', 'ngan');

  S.formDangMo = function(){ moPhieuXe(taskId); };   // đóng khung xem tệp thì quay lại đây
  moTraoDoi(taskId);
}

/* ---------- HCNS chốt xe ---------- */

function openChotXeForm(taskId, lyDoGanDe, trung){
  var p = phieuTheoTask(taskId);
  if (!p) return;
  var goiY = p.XeID || p.XeDeXuat || '';
  var xeGoi = xeTheoId(goiY);

  var canhBao = '';
  if (trung && trung.length){
    canhBao = '<div class="xe-canh"><b>⚠️ Xe này đã có lịch trong khung giờ đó</b><ul>'
      + trung.map(function(c){
          return '<li>' + esc(c.SoPhieu + ' · ' + c.NguoiDat + ' · '
            + c.GioDi.slice(11) + '–' + c.GioVe.slice(11) + ' · ' + c.MucDich) + '</li>';
        }).join('')
      + '</ul>'
      + (S.xe.ganDeDuoc
          ? '<div class="field"><label>Lý do gán đè *</label>'
            + '<input id="cxLyDo" placeholder="Vì sao vẫn điều xe này?"></div>'
          : '<p class="muted small">Chỉ Admin hoặc Quản lý mới được gán đè. Hãy chọn xe khác.</p>')
      + '</div>';
  }

  openModal('<h3>' + (p.XeID ? 'Đổi xe / lái xe cho ' : 'Chốt xe cho ') + esc(p.SoPhieu) + '</h3>'
  + (p.XeID && p.TaiXeXacNhan === 'Đã nhận'
      ? '<div class="nhac">⚠️ Lái xe đã nhận chuyến này. Đổi xe sẽ đưa phiếu về trạng thái '
        + 'chờ xác nhận lại và báo cho lái xe mới.</div>' : '')
  + '<p class="muted small">' + esc(p.MucDich) + ' — ' + esc(p.GioDi) + ' → ' + esc(p.GioVe)
  +   ' · ' + p.SoNguoi + ' người</p>'
  + (p.LyDoDoiXe ? '<p class="small" style="color:var(--warn)">' + esc(p.LyDoDoiXe) + '</p>' : '')
  + canhBao
  + '<div class="field"><label>Xe *</label><select id="cxXe" onchange="chotXeDoiXe()">'
  +   optXe(goiY) + '</select></div>'
  + '<div class="field"><label>Lái xe *</label><select id="cxLai">'
  +   optLaiXe(p.TaiXe || (xeGoi && xeGoi.TaiXe) || '') + '</select></div>'
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="moPhieuXe(\'' + taskId + '\')">Quay lại</button>'
  +   '<button class="btn primary" onclick="luuChotXe(\'' + taskId + '\')">'
  +     (trung && trung.length ? 'Vẫn chốt xe này' : 'Chốt xe') + '</button></div>');
}

/** Đổi xe thì tự điền lái xe cố định của xe đó */
function chotXeDoiXe(){
  var x = xeTheoId(vGt('cxXe'));
  var e = document.getElementById('cxLai');
  if (x && x.TaiXe && e) e.value = x.TaiXe;
}

function luuChotXe(taskId){
  var xeId = vGt('cxXe'), lai = vGt('cxLai');
  if (!xeId){ toast('Chọn xe'); return; }
  if (!lai){ toast('Chọn lái xe'); return; }
  var lyDo = vGt('cxLyDo');

  call('apiDuyetDatXe', [S.token, taskId, xeId, lai, lyDo], function(r){
    if (!r.ok){
      if (r.trung && r.trung.length){
        if (lyDo && !r.canLyDo){ toast(r.msg); return; }
        openChotXeForm(taskId, lyDo, r.trung);   // hiện cảnh báo trùng lịch rồi hỏi lại
        if (lyDo) toast(r.msg);
        return;
      }
      toast(r.msg); return;
    }
    closeModal();
    toast('Đã chốt xe, đang chờ lái xe xác nhận');
    reload();
  });
}

function traLaiPhieuXe(taskId){
  var ly = prompt('Lý do không bố trí được xe:');
  if (ly === null) return;
  if (!String(ly).trim()){ toast('Phải ghi lý do'); return; }
  call('apiTraLaiDatXe', [S.token, taskId, String(ly).trim()], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã trả lại phiếu cho người đặt'); reload();
  });
}

function huyPhieuXe(taskId){
  var ly = prompt('Lý do huỷ chuyến (có thể bỏ trống):');
  if (ly === null) return;
  call('apiHuyDatXe', [S.token, taskId, String(ly || '').trim()], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã huỷ phiếu'); reload();
  });
}

/* ---------- Lái xe xác nhận ---------- */

function taiXeXacNhan(taskId, dongY){
  var ly = '';
  if (!dongY){
    ly = prompt('Lý do không nhận được chuyến này:');
    if (ly === null) return;
    if (!String(ly).trim()){ toast('Phải nêu lý do'); return; }
  }
  call('apiTaiXeXacNhan', [S.token, taskId, !!dongY, String(ly).trim()], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal();
    toast(dongY ? 'Đã nhận chuyến, đã báo cho người đặt' : 'Đã chuyển lại cho bộ phận điều xe');
    reload();
  });
}

/* ---------- Kết thúc chuyến ---------- */

function openChotChuyenForm(taskId){
  var p = phieuTheoTask(taskId);
  if (!p) return;
  var co = S.xe.theoDoiKm;

  openModal('<h3>Kết thúc chuyến ' + esc(p.SoPhieu) + '</h3>'
  + (co
    ? '<div class="form-grid">'
      + '<div class="field"><label>Km lúc xuất phát</label>'
      +   '<input type="number" id="ccKmDau" min="0" value="' + (p.KmDau || '') + '"></div>'
      + '<div class="field"><label>Km lúc về</label>'
      +   '<input type="number" id="ccKmCuoi" min="0" value="' + (p.KmCuoi || '') + '"></div>'
      + '</div>'
      + '<div class="form-grid">'
      + '<div class="field"><label>Tiền xăng (đ)</label>'
      +   '<input type="number" id="ccXang" min="0" value="' + (p.ChiPhiXang || '') + '"></div>'
      + '<div class="field"><label>Phí cầu đường (đ)</label>'
      +   '<input type="number" id="ccCau" min="0" value="' + (p.ChiPhiCauDuong || '') + '"></div>'
      + '</div>'
      + '<div class="field"><label>Chi phí khác (đ)</label>'
      +   '<input type="number" id="ccKhac" min="0" value="' + (p.ChiPhiKhac || '') + '"></div>'
    : '<p class="muted">Chuyến sẽ được đóng lại. Hệ thống đang tắt phần theo dõi km và chi phí.</p>')
  + '<div class="field"><label>Ghi chú chuyến đi</label>'
  +   '<textarea id="ccGhiChu" rows="2">' + esc(p.GhiChuChuyen || '') + '</textarea></div>'
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="moPhieuXe(\'' + taskId + '\')">Quay lại</button>'
  +   '<button class="btn primary" onclick="luuChotChuyen(\'' + taskId + '\')">Kết thúc chuyến</button></div>');
}

function luuChotChuyen(taskId){
  call('apiChotChuyen', [S.token, taskId, {
    KmDau: vGt('ccKmDau'), KmCuoi: vGt('ccKmCuoi'),
    ChiPhiXang: vGt('ccXang'), ChiPhiCauDuong: vGt('ccCau'), ChiPhiKhac: vGt('ccKhac'),
    GhiChuChuyen: vGt('ccGhiChu')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã kết thúc chuyến'); reload();
  });
}

/* ---------- Danh mục xe ---------- */

function openXeForm(id){
  var x = (S.xe.xe || []).filter(function(v){ return String(v.ID) === String(id); })[0] || {};
  openModal('<h3>' + (id ? 'Sửa xe' : 'Thêm xe') + '</h3>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Biển số *</label>'
  +     '<input id="xfBienSo" value="' + esc(x.BienSo || '') + '" placeholder="30A-123.45"></div>'
  +   '<div class="field"><label>Tên gọi</label>'
  +     '<input id="xfTen" value="' + esc(x.Ten || '') + '" placeholder="Toyota Innova trắng"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Loại xe</label>'
  +     '<input id="xfLoai" value="' + esc(x.Loai || '') + '" placeholder="7 chỗ"></div>'
  +   '<div class="field"><label>Số chỗ</label>'
  +     '<input type="number" id="xfSoCho" min="0" value="' + (x.SoCho || '') + '"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Lái xe cố định</label><select id="xfTaiXe">'
  +     optLaiXe(x.TaiXe || '', '— chưa phân —') + '</select></div>'
  +   '<div class="field"><label>Điện thoại lái xe</label>'
  +     '<input id="xfDT" value="' + esc(x.SoDienThoai || '') + '" placeholder="Gửi kèm khi báo người đặt"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Hạn đăng kiểm</label>'
  +     '<input type="date" id="xfDangKiem" value="' + esc(x.HanDangKiem || '') + '"></div>'
  +   '<div class="field"><label>Hạn bảo hiểm</label>'
  +     '<input type="date" id="xfBaoHiem" value="' + esc(x.HanBaoHiem || '') + '"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Trạng thái</label><select id="xfTrangThai">'
  +     ['Sẵn sàng','Đang bảo dưỡng','Ngừng dùng'].map(function(v){
            return '<option' + (v === (x.TrangThai || 'Sẵn sàng') ? ' selected' : '') + '>' + v + '</option>';
          }).join('') + '</select></div>'
  +   '<div class="field"><label>Cho điều đi thế</label><select id="xfDiThe">'
  +     '<option value="1"' + (x.ChoDiThe === false ? '' : ' selected') + '>Có</option>'
  +     '<option value="0"' + (x.ChoDiThe === false ? ' selected' : '') + '>Không</option></select>'
  +     '<div class="small muted" style="margin-top:4px">Khi xe ghim của tuyến bận, '
  +     'hệ thống có được đề xuất xe này đi thay không.</div></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Định mức xăng (lít/100km)</label>'
  +     '<input type="number" step="0.1" min="0" id="xfDinhMuc" value="' + (x.DinhMucXang || '') + '">'
  +     '<div class="small muted" style="margin-top:4px">Dùng để đối chiếu với xăng thực mua '
  +     'trong báo cáo tháng.</div></div>'
  +   '<div class="field"><label>Chu kỳ bảo dưỡng (km)</label>'
  +     '<input type="number" min="0" step="500" id="xfChuKy" value="' + (x.ChuKyBaoDuongKm || '') + '">'
  +     '<div class="small muted" style="margin-top:4px">Ví dụ 5000. Còn 500km là hệ thống nhắc.</div></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Km hiện tại (đồng hồ)</label>'
  +     '<input type="number" min="0" id="xfKmHienTai" value="' + (x.KmHienTai || '') + '">'
  +     '<div class="small muted" style="margin-top:4px">Tự tăng theo km cuối của mỗi chuyến.</div></div>'
  +   '<div class="field"><label>Bảo dưỡng gần nhất</label>'
  +     '<input type="number" min="0" id="xfBdKm" placeholder="km" value="' + (x.BaoDuongCuoiKm || '') + '">'
  +     '<input type="date" id="xfBdNgay" style="margin-top:6px" value="' + esc(x.BaoDuongCuoiNgay || '') + '"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Xăng tồn trong bình đầu kỳ (lít)</label>'
  +     '<input type="number" step="0.01" id="xfTonXang" value="' + (x.TonXangDauKy || '') + '">'
  +     '<div class="small muted" style="margin-top:4px">Lượng xăng còn trong bình trước khi '
  +     'bắt đầu theo dõi bằng app. Báo cáo cộng dồn từ số này.</div></div>'
  +   '<div class="field"><label>Tháng bắt đầu theo dõi</label>'
  +     '<input type="month" id="xfThangDau" value="' + esc(x.ThangDauKy || '') + '">'
  +     '<div class="small muted" style="margin-top:4px">Bỏ trống thì lấy tháng có dữ liệu sớm nhất.</div></div>'
  + '</div>'
  + '<div class="field"><label>Ghi chú</label>'
  +   '<textarea id="xfGhiChu" rows="2">' + esc(x.GhiChu || '') + '</textarea></div>'
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   '<button class="btn primary" onclick="luuXe(\'' + (id || '') + '\')">Lưu</button></div>');
}

function luuXe(id){
  call('apiLuuXe', [S.token, {
    ID: id, BienSo: vGt('xfBienSo'), Ten: vGt('xfTen'), Loai: vGt('xfLoai'),
    SoCho: vGt('xfSoCho'), TaiXe: vGt('xfTaiXe'), SoDienThoai: vGt('xfDT'),
    HanDangKiem: vGt('xfDangKiem'), HanBaoHiem: vGt('xfBaoHiem'),
    TrangThai: vGt('xfTrangThai'), ChoDiThe: vGt('xfDiThe') === '1',
    GhiChu: vGt('xfGhiChu'),
    DinhMucXang: vGt('xfDinhMuc'), ChuKyBaoDuongKm: vGt('xfChuKy'),
    KmHienTai: vGt('xfKmHienTai'),
    BaoDuongCuoiKm: vGt('xfBdKm'), BaoDuongCuoiNgay: vGt('xfBdNgay'),
    TonXangDauKy: vGt('xfTonXang'), ThangDauKy: vGt('xfThangDau')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã lưu xe'); loadXe();
  });
}

function xoaXe(id){
  var x = xeTheoId(id);
  if (!confirm('Xoá xe ' + (x ? x.BienSo : '') + ' khỏi danh mục?')) return;
  call('apiXoaXe', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã xoá xe'); loadXe();
  });
}

/* ---------- Danh mục tuyến ---------- */

function openTuyenForm(id){
  var t = (S.xe.tuyen || []).filter(function(v){ return String(v.ID) === String(id); })[0] || {};
  var ngay = String(t.CacNgay || '').split(',').filter(Boolean);
  var oThu = [1,2,3,4,5,6,0].map(function(n){
    return '<label class="xe-thu"><input type="checkbox" class="tfThu" value="' + n + '"'
      + (ngay.indexOf(String(n)) >= 0 ? ' checked' : '') + '> ' + TEN_THU[n] + '</label>';
  }).join('');

  openModal('<h3>' + (id ? 'Sửa tuyến' : 'Ghim tuyến mới') + '</h3>'
  + '<div class="field"><label>Tên tuyến *</label>'
  +   '<input id="tfTen" value="' + esc(t.TenTuyen || '') + '" placeholder="Văn phòng → Dự án Parc Ville"></div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Điểm đi</label>'
  +     '<input id="tfDi" value="' + esc(t.DiemDi || '') + '" placeholder="Văn phòng công ty"></div>'
  +   '<div class="field"><label>Điểm đến *</label>'
  +     '<input id="tfDen" value="' + esc(t.DiemDen || '') + '"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Xe ghim</label><select id="tfXe">'
  +     optXe(t.XeGhim || '', '— không ghim xe —') + '</select></div>'
  +   '<div class="field"><label>Lái xe ghim</label><select id="tfLai">'
  +     optLaiXe(t.TaiXeGhim || '', '— theo lái xe của xe —') + '</select></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Giờ đi</label>'
  +     '<input type="time" id="tfGioDi" value="' + esc(t.GioDi || '') + '"></div>'
  +   '<div class="field"><label>Giờ về</label>'
  +     '<input type="time" id="tfGioVe" value="' + esc(t.GioVe || '') + '"></div>'
  + '</div>'
  + '<div class="field"><label>Ngày cố định trong tuần</label>'
  +   '<div class="xe-thu-hang">' + oThu + '</div>'
  +   '<div class="small muted" style="margin-top:4px">Không tích ngày nào thì đây là tuyến hay đi, '
  +   'dùng để điền nhanh vào bất kỳ ngày nào.</div></div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Km ước tính</label>'
  +     '<input type="number" id="tfKm" min="0" value="' + (t.KmUocTinh || '') + '"></div>'
  +   '<div class="field"><label>Trạng thái</label><select id="tfTrangThai">'
  +     ['Đang chạy','Tạm dừng'].map(function(v){
            return '<option' + (v === (t.TrangThai || 'Đang chạy') ? ' selected' : '') + '>' + v + '</option>';
          }).join('') + '</select></div>'
  + '</div>'
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   '<button class="btn primary" onclick="luuTuyen(\'' + (id || '') + '\')">Lưu</button></div>');
}

function luuTuyen(id){
  var thu = [];
  document.querySelectorAll('.tfThu').forEach(function(c){ if (c.checked) thu.push(c.value); });
  call('apiLuuTuyen', [S.token, {
    ID: id, TenTuyen: vGt('tfTen'), DiemDi: vGt('tfDi'), DiemDen: vGt('tfDen'),
    XeGhim: vGt('tfXe'), TaiXeGhim: vGt('tfLai'), CacNgay: thu.join(','),
    GioDi: vGt('tfGioDi'), GioVe: vGt('tfGioVe'), KmUocTinh: vGt('tfKm'),
    TrangThai: vGt('tfTrangThai')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã lưu tuyến'); loadXe();
  });
}

function xoaTuyen(id){
  if (!confirm('Xoá tuyến này?')) return;
  call('apiXoaTuyen', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã xoá tuyến'); loadXe();
  });
}

/* =========================================================
   CHI PHÍ VÀ BẢO DƯỠNG XE
   ========================================================= */

var LOAI_BD = ['Bảo dưỡng định kỳ','Sửa chữa','Thay lốp','Thay dầu','Đăng kiểm','Khác'];
var LOAI_HD = ['Xăng','Dầu','Phí cầu đường','Gửi xe','Rửa xe','Sửa chữa','Bảo hiểm','Khác'];

function tien(n){ return (Number(n) || 0).toLocaleString('vi-VN'); }

/** Người này có được nhập chi phí cho xe đó không — soi đúng luật của server
 *  để nút bấm không hiện ra rồi mới báo lỗi. */
function nhapDuocChiPhi(xeId){
  if (chiXem()) return false;
  if (S.xe.quanLy || S.xe.dieuXeDuoc) return true;
  if (!S.xe.laLaiXe) return false;
  var x = xeTheoId(xeId);
  return !!x && x.TaiXe === S.me.Ten;
}
/** Có xe nào người này nhập được không */
function coXeDeNhap(){
  return (S.xe.xe || []).some(function(x){ return nhapDuocChiPhi(x.ID); });
}

function veChiPhi(){
  var thang = S.xeThang || today().slice(0, 7);
  var them = coXeDeNhap();

  return '<div class="xe-dieu">'
    + '<label class="small muted">Tháng</label>'
    + '<input type="month" id="bcThang" value="' + thang + '" onchange="doiThangXe()">'
    + '<span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">'
    +   '<button class="btn sm" onclick="openBaoCaoXe(\'nhienlieu\')">📊 Báo cáo nhiên liệu</button>'
    +   '<button class="btn sm" onclick="openBaoCaoXe(\'nhattrinh\')">📋 Nhật trình</button>'
    +   (them
        ? '<button class="btn sm" onclick="openBaoDuongForm()">+ Bảo dưỡng</button>'
          + '<button class="btn primary sm" onclick="openHoaDonForm()">+ Hoá đơn</button>'
        : '')
    + '</span></div>'
    + '<div id="bcXeBox">' + khungCho(4) + '</div>'
    + veBangBaoDuong(thang) + veBangHoaDon(thang);
}

function doiThangXe(){
  S.xeThang = document.getElementById('bcThang').value || today().slice(0, 7);
  veXeTab();
}

/** Bảng tổng hợp tháng — lấy từ server vì phải gộp nhiều bảng */
function loadBaoCaoXe(){
  var thang = S.xeThang || today().slice(0, 7);
  call('apiBaoCaoXe', [S.token, thang], function(r){
    var box = document.getElementById('bcXeBox');
    if (!box) return;
    box.classList.remove('muted');
    if (!r || !r.ok){ box.innerHTML = '<p class="muted">' + esc(r && r.msg || 'Không mở được báo cáo') + '</p>'; return; }

    var co = r.dong.filter(function(d){ return d.soChuyen || d.tongChiPhi || d.km; });
    if (!co.length){
      box.innerHTML = '<p class="muted">Tháng ' + esc(r.thang) + ' chưa có chuyến hay chi phí nào.</p>';
      return;
    }
    var tong = co.reduce(function(a, d){
      a.km += d.km; a.chuyen += d.soChuyen; a.tien += d.tongChiPhi;
      a.xang += d.xangThucTe; return a;
    }, {km:0, chuyen:0, tien:0, xang:0});

    box.innerHTML = '<div class="scroll-x"><table>'
      + '<tr><th>Xe</th><th>Lái xe</th><th>Chuyến</th><th>Km</th>'
      + '<th title="Xăng dầu thực mua trong tháng">Xăng TT</th>'
      + '<th title="Xăng theo định mức của quãng đường đã chạy">Định mức</th>'
      + '<th title="Thực mua trừ định mức">Lệch</th>'
      + '<th title="Tổng hoá đơn">HĐ</th><th title="Chi phí bảo dưỡng">BD</th>'
      + '<th title="Chi phí lẻ khai trên phiếu chuyến">Lẻ</th>'
      + '<th>Tổng</th><th title="Còn bao nhiêu km tới hạn bảo dưỡng">Hạn BD</th></tr>'
      + co.map(function(d){
          var lech = d.xangDinhMuc ? d.lechXang : null;
          var mauLech = lech === null ? '' : (lech > 0 ? 'color:var(--danger)' : 'color:var(--ok)');
          var con = d.conLaiDenBaoDuong;
          return '<tr><td><b>' + esc(d.BienSo) + '</b></td>'
            + '<td>' + (d.TaiXe ? avatarHtml(d.TaiXe) + ' ' + esc(d.TaiXe) : '—') + '</td>'
            + '<td class="mono-so">' + d.soChuyen + '</td>'
            + '<td class="mono-so">' + (d.km || '—') + '</td>'
            + '<td class="mono-so">' + (d.xangThucTe || '—') + '</td>'
            + '<td class="mono-so">' + (d.xangDinhMuc || '—') + '</td>'
            + '<td class="mono-so" style="' + mauLech + '">'
            +   (lech === null ? '—' : (lech > 0 ? '+' : '') + lech) + '</td>'
            + '<td class="mono-so">' + (d.tienHoaDon ? tien(d.tienHoaDon) : '—') + '</td>'
            + '<td class="mono-so">' + (d.tienBaoDuong ? tien(d.tienBaoDuong) : '—') + '</td>'
            + '<td class="mono-so">' + (d.tienChuyen ? tien(d.tienChuyen) : '—') + '</td>'
            + '<td class="mono-so"><b>' + tien(d.tongChiPhi) + '</b></td>'
            + '<td class="mono-so' + (con !== null && con <= 500 ? ' xe-sap-han' : '') + '">'
            +   (con === null ? '—' : (con > 0 ? 'còn ' + con + ' km' : 'quá ' + (-con) + ' km')) + '</td>'
            + '</tr>';
        }).join('')
      + '<tr><td colspan="2"><b>Tổng</b></td>'
      +   '<td class="mono-so"><b>' + tong.chuyen + '</b></td>'
      +   '<td class="mono-so"><b>' + tong.km + '</b></td>'
      +   '<td class="mono-so"><b>' + (Math.round(tong.xang * 10) / 10 || '—') + '</b></td>'
      +   '<td colspan="5"></td>'
      +   '<td class="mono-so"><b>' + tien(tong.tien) + '</b></td><td></td></tr>'
      + '</table></div>'
      + '<p class="small muted" style="margin-top:8px">Cột <b>Lệch</b> là xăng thực mua trừ đi '
      + 'xăng theo định mức của quãng đường đã chạy. Số dương màu đỏ nghĩa là dùng nhiều hơn định mức.</p>';
  });
}

function veBangBaoDuong(thang){
  var ds = (S.xe.baoDuong || []).filter(function(b){
    return b.TrangThai === 'Đã hẹn' || String(b.NgayLam).slice(0, 7) === thang;
  }).sort(function(a, b){ return a.NgayLam < b.NgayLam ? 1 : -1; });

  var dau = '<h3 style="margin-top:26px">🛠 Bảo dưỡng &amp; sửa chữa</h3>';
  if (laDienThoai()) {
    return dau + (!ds.length
      ? '<div class="the-trong">Tháng này chưa có bản ghi bảo dưỡng.</div>'
      : '<div class="the-ds">' + ds.map(function(b){
          return '<div class="the-o">'
            + '<div class="the-dau"><b>' + esc(tenXe(b.XeID) || '—') + '</b>'
            +   chip(b.TrangThai, b.TrangThai === 'Đã làm' ? '#10b981' : '#f59e0b') + '</div>'
            + '<div class="the-phu">' + esc(b.NoiDung) + '</div>'
            + '<div class="the-hang"><span class="nhan">' + esc(b.Loai) + '</span>'
            +   '<span class="mono-so">' + esc(b.NgayLam || b.NgayHenLai || '—') + '</span>'
            +   (b.KmLucLam ? '<span class="nhan">Km</span><span class="mono-so">' + b.KmLucLam + '</span>' : '')
            + '</div>'
            + '<div class="the-hang">' + (b.NoiLam ? '<span>' + esc(b.NoiLam) + '</span>' : '')
            +   (b.ChiPhi ? '<span class="day mono-so"><b>' + tien(b.ChiPhi) + '</b></span>' : '') + '</div>'
            + '<div class="the-chan">'
            +   '<button class="btn" onclick="moTepXe(\'' + b.ID + '\',\'Bảo dưỡng\')">Xem tệp</button>'
            +   (nhapDuocChiPhi(b.XeID)
                  ? '<button class="btn day" onclick="openBaoDuongForm(\'' + b.ID + '\')">Sửa</button>' : '')
            + '</div></div>';
        }).join('') + '</div>');
  }
  return dau
    + (!ds.length
      ? '<p class="muted">Tháng này chưa có bản ghi bảo dưỡng. Các lịch đã hẹn cho tương lai cũng hiện ở đây.</p>'
      : '<div class="scroll-x"><table>'
        + '<tr><th>Xe</th><th>Loại</th><th>Ngày</th><th>Km</th><th>Nội dung</th>'
        + '<th>Nơi làm</th><th>Chi phí</th><th>Trạng thái</th><th>Tệp</th><th></th></tr>'
        + ds.map(function(b){
            return '<tr><td><b>' + esc(tenXe(b.XeID) || '—') + '</b></td>'
              + '<td>' + esc(b.Loai) + '</td>'
              + '<td class="mono-so">' + esc(b.NgayLam || b.NgayHenLai || '—') + '</td>'
              + '<td class="mono-so">' + (b.KmLucLam || '—') + '</td>'
              + '<td>' + esc(b.NoiDung) + '</td>'
              + '<td>' + esc(b.NoiLam || '—') + '</td>'
              + '<td class="mono-so">' + (b.ChiPhi ? tien(b.ChiPhi) : '—') + '</td>'
              + '<td>' + chip(b.TrangThai, b.TrangThai === 'Đã làm' ? '#10b981' : '#f59e0b') + '</td>'
              + '<td><button class="btn sm" onclick="moTepXe(\'' + b.ID + '\',\'Bảo dưỡng\')">Xem</button></td>'
              + '<td>' + (nhapDuocChiPhi(b.XeID)
                  ? '<button class="btn sm" onclick="openBaoDuongForm(\'' + b.ID + '\')">Sửa</button>' : '') + '</td>'
              + '</tr>';
          }).join('') + '</table></div>');
}

function veBangHoaDon(thang){
  var ds = (S.xe.hoaDon || []).filter(function(h){
    return String(h.NgayHoaDon).slice(0, 7) === thang;
  }).sort(function(a, b){ return a.NgayHoaDon < b.NgayHoaDon ? 1 : -1; });

  var dau = '<h3 style="margin-top:26px">🧾 Hoá đơn xăng dầu và chi phí khác</h3>';
  if (laDienThoai()) {
    return dau + (!ds.length
      ? '<div class="the-trong">Tháng này chưa nhập hoá đơn nào.</div>'
      : '<div class="the-ds">' + ds.map(function(h){
          return '<div class="the-o">'
            + '<div class="the-dau"><b>' + esc(tenXe(h.XeID) || '—') + '</b>'
            +   '<span class="mono-so"><b>' + tien(h.SoTien) + '</b></span></div>'
            + '<div class="the-hang"><span class="nhan">' + esc(h.Loai) + '</span>'
            +   '<span class="mono-so">' + esc(h.NgayHoaDon) + '</span>'
            +   (h.SoHoaDon ? '<span class="nhan">Số</span><span class="mono-so">' + esc(h.SoHoaDon) + '</span>' : '')
            + '</div>'
            + (h.NhaCungCap ? '<div class="the-phu">' + esc(h.NhaCungCap) + '</div>' : '')
            + ((h.SoLuong || h.DonGia)
                ? '<div class="the-hang">'
                  + (h.SoLuong ? '<span class="nhan">Lượng</span><span class="mono-so">' + h.SoLuong + '</span>' : '')
                  + (h.DonGia ? '<span class="nhan">Đơn giá</span><span class="mono-so">' + tien(h.DonGia) + '</span>' : '')
                  + '</div>'
                : '')
            + '<div class="the-chan">'
            +   '<span class="nhan">' + esc(h.NguoiNhap || '—') + '</span>'
            +   '<button class="btn" onclick="moTepXe(\'' + h.ID + '\',\'Hoá đơn\')">Xem tệp</button>'
            +   (nhapDuocChiPhi(h.XeID)
                  ? '<button class="btn day" onclick="openHoaDonForm(\'' + h.ID + '\')">Sửa</button>' : '')
            + '</div></div>';
        }).join('') + '</div>');
  }
  return dau
    + (!ds.length
      ? '<p class="muted">Tháng này chưa nhập hoá đơn nào.</p>'
      : '<div class="scroll-x"><table>'
        + '<tr><th>Xe</th><th>Loại</th><th>Ngày</th><th>Số HĐ</th><th>Nhà cung cấp</th>'
        + '<th>Lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Người nhập</th><th>Tệp</th><th></th></tr>'
        + ds.map(function(h){
            return '<tr><td><b>' + esc(tenXe(h.XeID) || '—') + '</b></td>'
              + '<td>' + esc(h.Loai) + '</td>'
              + '<td class="mono-so">' + esc(h.NgayHoaDon) + '</td>'
              + '<td class="mono-so">' + esc(h.SoHoaDon || '—') + '</td>'
              + '<td>' + esc(h.NhaCungCap || '—') + '</td>'
              + '<td class="mono-so">' + (h.SoLuong || '—') + '</td>'
              + '<td class="mono-so">' + (h.DonGia ? tien(h.DonGia) : '—') + '</td>'
              + '<td class="mono-so"><b>' + tien(h.SoTien) + '</b></td>'
              + '<td>' + esc(h.NguoiNhap || '—') + '</td>'
              + '<td><button class="btn sm" onclick="moTepXe(\'' + h.ID + '\',\'Hoá đơn\')">Xem</button></td>'
              + '<td>' + (nhapDuocChiPhi(h.XeID)
                  ? '<button class="btn sm" onclick="openHoaDonForm(\'' + h.ID + '\')">Sửa</button>' : '') + '</td>'
              + '</tr>';
          }).join('') + '</table></div>');
}

/* ---------- Form bảo dưỡng ---------- */

function openBaoDuongForm(id){
  var b = (S.xe.baoDuong || []).filter(function(x){ return String(x.ID) === String(id); })[0] || {};
  var opt = function(l, v){ return l.map(function(x){
    return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); };

  openModal('<h3>🛠 ' + (id ? 'Sửa bản ghi bảo dưỡng' : 'Ghi nhận bảo dưỡng / sửa chữa') + '</h3>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Xe *</label><select id="bdXe">' + optXe(b.XeID) + '</select></div>'
  +   '<div class="field"><label>Loại</label><select id="bdLoai">' + opt(LOAI_BD, b.Loai) + '</select></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Trạng thái</label><select id="bdTrangThai" onchange="bdDoiTrangThai()">'
  +     opt(['Đã làm','Đã hẹn'], b.TrangThai || 'Đã làm') + '</select></div>'
  +   '<div class="field"><label>Ngày làm *</label>'
  +     '<input type="date" id="bdNgay" value="' + esc(b.NgayLam || today()) + '"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Km lúc làm</label>'
  +     '<input type="number" min="0" id="bdKm" value="' + (b.KmLucLam || '') + '">'
  +     '<div class="small muted" style="margin-top:4px">Với bảo dưỡng định kỳ, số này là mốc '
  +     'tính cho lần bảo dưỡng kế tiếp.</div></div>'
  +   '<div class="field"><label>Hẹn lại ngày</label>'
  +     '<input type="date" id="bdHen" value="' + esc(b.NgayHenLai || '') + '"></div>'
  + '</div>'
  + '<div class="field"><label>Nội dung *</label>'
  +   '<textarea id="bdNoiDung" rows="2" placeholder="Thay dầu máy, lọc gió, kiểm tra phanh...">'
  +   esc(b.NoiDung || '') + '</textarea></div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Nơi làm</label>'
  +     '<input id="bdNoiLam" value="' + esc(b.NoiLam || '') + '" placeholder="Garage..."></div>'
  +   '<div class="field"><label>Chi phí (đ)</label>'
  +     '<input type="number" min="0" id="bdChiPhi" value="' + (b.ChiPhi || '') + '"></div>'
  + '</div>'
  + '<div class="field"><label>Ghi chú</label>'
  +   '<textarea id="bdGhiChu" rows="2">' + esc(b.GhiChu || '') + '</textarea></div>'
  + khoiTepXe(id, 'Phiếu bảo dưỡng')
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   (id && nhapDuocChiPhi(b.XeID)
      ? '<button class="btn" onclick="xoaBaoDuong(\'' + id + '\')">Xoá</button>' : '')
  +   '<button class="btn primary" onclick="luuBaoDuong(\'' + (id || '') + '\')">Lưu</button></div>');
  if (id) loadTepXe(id);
}

function bdDoiTrangThai(){
  var hen = vGt('bdTrangThai') === 'Đã hẹn';
  var e = document.getElementById('bdHen');
  if (hen && e && !e.value) e.value = today();
}

function luuBaoDuong(id){
  call('apiLuuBaoDuong', [S.token, {
    ID: id, XeID: vGt('bdXe'), Loai: vGt('bdLoai'), TrangThai: vGt('bdTrangThai'),
    NgayLam: vGt('bdNgay'), KmLucLam: vGt('bdKm'), NgayHenLai: vGt('bdHen'),
    NoiDung: vGt('bdNoiDung'), NoiLam: vGt('bdNoiLam'), ChiPhi: vGt('bdChiPhi'),
    GhiChu: vGt('bdGhiChu')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã lưu');
    // Bản ghi mới: mở lại ở chế độ sửa để đính kèm được phiếu
    if (!id){ loadXe(); setTimeout(function(){ openBaoDuongForm(r.id); }, 350); }
    else { closeModal(); loadXe(); }
  });
}

function xoaBaoDuong(id){
  if (!confirm('Xoá bản ghi bảo dưỡng này? Tệp đính kèm cũng bị xoá theo.')) return;
  call('apiXoaBaoDuong', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã xoá'); loadXe();
  });
}

/* ---------- Form hoá đơn ---------- */

function openHoaDonForm(id){
  var h = (S.xe.hoaDon || []).filter(function(x){ return String(x.ID) === String(id); })[0] || {};
  var opt = function(l, v){ return l.map(function(x){
    return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); };

  openModal('<h3>🧾 ' + (id ? 'Sửa hoá đơn' : 'Nhập hoá đơn xe') + '</h3>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Xe *</label><select id="hdXe">' + optXe(h.XeID) + '</select></div>'
  +   '<div class="field"><label>Loại chi phí</label><select id="hdLoai" onchange="hdTinhTien()">'
  +     opt(LOAI_HD, h.Loai) + '</select></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Ngày hoá đơn *</label>'
  +     '<input type="date" id="hdNgay" value="' + esc(h.NgayHoaDon || today()) + '"></div>'
  +   '<div class="field"><label>Số hoá đơn</label>'
  +     '<input id="hdSo" value="' + esc(h.SoHoaDon || '') + '"></div>'
  + '</div>'
  + '<div class="field"><label>Nhà cung cấp</label>'
  +   '<input id="hdNCC" value="' + esc(h.NhaCungCap || '') + '" placeholder="Cây xăng, garage..."></div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Số lượng (lít)</label>'
  +     '<input type="number" step="0.01" min="0" id="hdSoLuong" value="' + (h.SoLuong || '') + '"'
  +     ' oninput="hdTinhTien()"></div>'
  +   '<div class="field"><label>Đơn giá (đ/lít)</label>'
  +     '<input type="number" min="0" id="hdDonGia" value="' + (h.DonGia || '') + '"'
  +     ' oninput="hdTinhTien()"></div>'
  + '</div>'
  + '<div class="field"><label>Thành tiền (đ) *</label>'
  +   '<input type="number" min="0" id="hdSoTien" value="' + (h.SoTien || '') + '">'
  +   '<div class="small muted" style="margin-top:4px" id="hdGoiY">Nhập lượng và đơn giá thì '
  +   'thành tiền tự tính, vẫn sửa tay được.</div></div>'
  + '<div class="field"><label>Ghi chú</label>'
  +   '<textarea id="hdGhiChu" rows="2">' + esc(h.GhiChu || '') + '</textarea></div>'
  + khoiTepXe(id, 'Ảnh / PDF hoá đơn')
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   (id && nhapDuocChiPhi(h.XeID)
      ? '<button class="btn" onclick="xoaHoaDon(\'' + id + '\')">Xoá</button>' : '')
  +   '<button class="btn primary" onclick="luuHoaDon(\'' + (id || '') + '\')">Lưu</button></div>');
  if (id) loadTepXe(id);
}

/** Lượng × đơn giá -> thành tiền. Không ghi đè nếu người dùng đã tự gõ số khác. */
function hdTinhTien(){
  var sl = Number(vGt('hdSoLuong')) || 0, dg = Number(vGt('hdDonGia')) || 0;
  var e = document.getElementById('hdSoTien');
  if (!e || !sl || !dg) return;
  if (!e.value || e.dataset.tuTinh === '1'){
    e.value = Math.round(sl * dg);
    e.dataset.tuTinh = '1';
  }
}

function luuHoaDon(id){
  call('apiLuuHoaDon', [S.token, {
    ID: id, XeID: vGt('hdXe'), Loai: vGt('hdLoai'), NgayHoaDon: vGt('hdNgay'),
    SoHoaDon: vGt('hdSo'), NhaCungCap: vGt('hdNCC'),
    SoLuong: vGt('hdSoLuong'), DonGia: vGt('hdDonGia'), SoTien: vGt('hdSoTien'),
    GhiChu: vGt('hdGhiChu')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã lưu hoá đơn');
    if (!id){ loadXe(); setTimeout(function(){ openHoaDonForm(r.id); }, 350); }
    else { closeModal(); loadXe(); }
  });
}

function xoaHoaDon(id){
  if (!confirm('Xoá hoá đơn này? Tệp đính kèm cũng bị xoá theo.')) return;
  call('apiXoaHoaDon', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã xoá'); loadXe();
  });
}

/* ---------- Tệp đính kèm của hoá đơn và bảo dưỡng ---------- */

function khoiTepXe(id, nhan){
  if (!id){
    return '<div class="nhac">📎 Bấm <b>Lưu</b> trước, biểu mẫu sẽ mở lại để bạn '
         + 'đính kèm ảnh chụp hoặc file PDF.</div>';
  }
  return '<div class="field"><label>' + esc(nhan) + '</label>'
    + '<input type="file" id="tepXeInput" accept="application/pdf,image/*" multiple'
    +   ' onchange="chonTepXe(event,\'' + id + '\')" style="display:none">'
    + '<button type="button" class="btn sm" onclick="document.getElementById(\'tepXeInput\').click()">'
    +   '+ Chọn tệp (PDF hoặc ảnh, dưới 8 MB)</button>'
    + '<div id="tepXeBox" style="margin-top:8px">' + khungCho(2) + '</div></div>';
}

function loadTepXe(id){
  call('apiTepXe', [S.token, id], function(ds){
    var box = document.getElementById('tepXeBox');
    if (!box) return;
    box.classList.remove('muted');
    if (!ds || !ds.length){ box.innerHTML = '<span class="muted">Chưa có tệp nào.</span>'; return; }
    box.innerHTML = ds.map(function(f){
      return '<span class="tep-chip">'
        + '<button class="btn sm" onclick="xemTepXe(\'' + f.ID + '\')">'
        +   esc(f.TenFile) + '</button>'
        + '<button class="btn sm" title="Xoá tệp" onclick="xoaTepXeUI(\'' + f.ID + '\',\'' + id + '\')">✕</button>'
        + '</span>';
    }).join(' ');
    donIcon(box);
  });
}

function chonTepXe(ev, id){
  var ds = [].slice.call(ev.target.files || []);
  ev.target.value = '';
  var hopLe = ds.filter(function(f){
    return f.type === 'application/pdf' || f.type.indexOf('image/') === 0; });
  if (hopLe.length < ds.length) toast('Bỏ qua ' + (ds.length - hopLe.length) + ' tệp không phải PDF hoặc ảnh');
  if (!hopLe.length) return;

  var con = hopLe.length;
  toast('Đang tải ' + con + ' tệp lên...');
  hopLe.forEach(function(f){
    if (f.size > 8 * 1024 * 1024){
      toast('"' + f.name + '" vượt 8 MB'); if (!--con) loadTepXe(id); return;
    }
    var fr = new FileReader();
    fr.onload = function(){
      call('apiUploadTepXe', [S.token, id, f.name, f.type, String(fr.result).split(',')[1]],
        function(r){
          if (!r.ok) toast(f.name + ': ' + r.msg);
          if (!--con) loadTepXe(id);
        });
    };
    fr.readAsDataURL(f);
  });
}

function xoaTepXeUI(fileId, id){
  if (!confirm('Xoá tệp này?')) return;
  call('apiXoaTepXe', [S.token, fileId], function(r){
    if (!r.ok){ toast(r.msg); return; }
    loadTepXe(id);
  });
}

/** Mở tệp của một bản ghi để xem nhanh, không cần vào form sửa */
function moTepXe(id, nhan){
  call('apiTepXe', [S.token, id], function(ds){
    if (!ds || !ds.length){ toast('Bản ghi này chưa có tệp đính kèm'); return; }
    openModal('<h3>' + esc(nhan) + ' — tệp đính kèm</h3>'
    + '<div style="display:flex;flex-direction:column;gap:8px">'
    + ds.map(function(f){
        return '<button class="btn" style="justify-content:flex-start" '
          + 'onclick="xemTepXe(\'' + f.ID + '\')">' + esc(f.TenFile) + '</button>';
      }).join('')
    + '</div><div class="modal-foot">'
    + '<button class="btn" onclick="closeModal()">Đóng</button></div>');
  });
}

/** Mở tệp hoá đơn / bảo dưỡng bằng chính khung xem của app.
 *  Đổ vào S.tepCache rồi gọi veKhungXem, nên nút phóng to và tải về
 *  dùng lại được y như tệp của công việc. */
function xemTepXe(fileId){
  S.xemQuayLai = S.formDangMo;
  var c = S.tepCache[fileId];
  if (c){ veKhungXem(c); return; }

  openModal('<h3>Đang mở tệp</h3><div class="dang-tai"><div class="spinner"></div>'
    + '<p class="muted small">Đang lấy tệp qua app. Tệp càng nặng càng lâu.</p></div>');
  call('apiXemTepXe', [S.token, fileId], function(r){
    if (!r.ok){ toast(r.msg); dongKhungXem(); return; }
    S.tepCache[fileId] = { id: fileId, ten: r.ten, loai: r.loai, b64: r.data,
                           url: blobUrl_(r.data, r.loai), tyLe: 1.3 };
    veKhungXem(S.tepCache[fileId]);
  });
}

/* =========================================================
   BÁO CÁO XE — bám đúng mẫu giấy công ty đang dùng
   In ra giấy, lưu PDF (qua hộp thoại in) hoặc tải Excel.
   ========================================================= */

/** Số kiểu Việt Nam: 53.614 ; 9,11 */
function sovn(n, le){
  n = Number(n) || 0;
  return n.toLocaleString('vi-VN', { minimumFractionDigits: le || 0,
                                     maximumFractionDigits: le || 0 });
}
/** Số âm ghi trong ngoặc như kế toán vẫn làm: (25) */
function soKT(n, le){
  n = Number(n) || 0;
  return n < 0 ? '(' + sovn(-n, le) + ')' : sovn(n, le);
}

function openBaoCaoXe(loai){
  if (!S.xe){ call('apiXeDanhMuc', [S.token], function(r){ S.xe = r; openBaoCaoXe(loai); }); return; }
  S.bcLoai = loai || S.bcLoai || 'nhienlieu';
  S.bcThang = S.bcThang || S.xeThang || today().slice(0, 7);
  S.bcXe = S.bcXe || '';
  veBaoCaoXe();
}

function veBaoCaoXe(){
  var nut = function(k, t){
    return '<button class="btn sm' + (S.bcLoai === k ? ' primary' : '') + '"'
      + ' onclick="doiLoaiBaoCao(\'' + k + '\')">' + t + '</button>';
  };
  openModal('<div class="no-print">'
  + '<h3>📊 Báo cáo xe</h3>'
  + '<div class="xe-dieu" style="margin-bottom:10px">'
  +   nut('nhienlieu', 'Nhiên liệu theo định mức') + nut('nhattrinh', 'Nhật trình chi tiết')
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Tháng</label>'
  +     '<input type="month" id="bcThg" value="' + S.bcThang + '" onchange="doiLocBaoCao()"></div>'
  +   '<div class="field"><label>Xe</label><select id="bcXeSel" onchange="doiLocBaoCao()">'
  +     '<option value="">— Tất cả xe —</option>'
  +     (S.xe.xe || []).map(function(x){
          return '<option value="' + esc(x.ID) + '"' + (S.bcXe === x.ID ? ' selected' : '') + '>'
            + esc(x.BienSo) + (x.Ten ? ' · ' + esc(x.Ten) : '') + '</option>'; }).join('')
  +   '</select></div>'
  + '</div></div>'
  + '<div id="bcNoiDung" class="muted">Đang lấy số liệu...</div>'
  + '<div class="no-print small muted" style="margin-top:12px">'
  +   '💡 Muốn ra file PDF: bấm <b>In / Xuất PDF</b> rồi ở ô <b>Máy in</b> chọn '
  +   '<b>Lưu dưới dạng PDF</b> (Save as PDF).</div>'
  + '<div class="modal-foot no-print">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   '<button class="btn" onclick="taiExcelBaoCao()">⬇ Tải Excel</button>'
  +   '<button class="btn primary" onclick="inToTrinh()">🖨 In / Xuất PDF</button></div>');
  loadBaoCaoChiTiet();
}

function doiLoaiBaoCao(k){ S.bcLoai = k; veBaoCaoXe(); }
function doiLocBaoCao(){
  S.bcThang = vGt('bcThg') || today().slice(0, 7);
  S.bcXe = vGt('bcXeSel');
  loadBaoCaoChiTiet();
}

function loadBaoCaoChiTiet(){
  var box = function(){ return document.getElementById('bcNoiDung'); };
  if (S.bcLoai === 'nhattrinh'){
    call('apiNhatTrinhXe', [S.token, S.bcThang, S.bcXe], function(r){
      var b = box(); if (!b) return;
      b.classList.remove('muted');
      if (!r || !r.ok){ b.innerHTML = '<p class="muted">' + esc(r && r.msg || 'Lỗi') + '</p>'; return; }
      S.bcDuLieu = r;
      b.innerHTML = veNhatTrinh(r);
    });
    return;
  }
  call('apiBaoCaoNhienLieu', [S.token, S.bcThang, S.bcXe], function(r){
    var b = box(); if (!b) return;
    b.classList.remove('muted');
    if (!r || !r.ok){ b.innerHTML = '<p class="muted">' + esc(r && r.msg || 'Lỗi') + '</p>'; return; }
    S.bcDuLieu = r;
    b.innerHTML = r.dong.map(veBangNhienLieu).join('<div class="bc-ngat"></div>');
  });
}

/* ---------- Mẫu 1: bảng tính nhiên liệu theo định mức ---------- */

function veBangNhienLieu(d){
  var thg = S.bcThang.split('-');
  var soThang = Number(thg[1]), nam = thg[0];
  var ngayCuoi = new Date(Number(nam), soThang, 0).getDate();

  return '<div class="bc-to">'
  + '<h2 class="bc-title">BẢNG TÍNH NHIÊN LIỆU TIÊU THỤ THEO ĐỊNH MỨC</h2>'
  + '<p class="bc-sub">(Tháng ' + soThang + '/' + nam + ')</p>'
  + '<p class="bc-info">- Họ và tên lái xe: <b>' + esc(d.TaiXe || '…………………………') + '</b></p>'
  + '<p class="bc-info">- Loại xe: <b>' + esc(d.TenXe || d.LoaiXe || '…………') + '</b>'
  +   ' &nbsp;- Biển KS: <b>' + esc(d.BienSo) + '</b></p>'
  + (d.thieuDinhMuc
      ? '<p class="bc-canh no-print">⚠️ Xe này chưa khai <b>Định mức xăng</b> nên cột (3) và (7) '
        + 'đang để trống. Vào <b>Đội xe &amp; tuyến → Sửa</b> để khai.</p>' : '')
  + '<table class="bc-bang">'
  + '<tr><th>Stt</th><th>Nội dung</th><th>Định mức<br>(lít/100 Km)</th>'
  +   '<th>Số Km<br>đầu tháng</th><th>Số Km<br>cuối tháng</th>'
  +   '<th>Số Km đi<br>trong tháng</th><th>Lượng xăng<br>tiêu thụ (lít)</th><th>Ghi chú</th></tr>'
  + '<tr class="bc-ct"><td>(1)</td><td>(2)</td><td>(3)</td><td>(4)</td><td>(5)</td>'
  +   '<td>(6)=(5)-(4)</td><td>(7)=(3)*(6)/100</td><td>(8)</td></tr>'
  + '<tr><td>1</td>'
  +   '<td class="bc-trai">Quãng đường xe hoạt động từ 1/' + soThang + '/' + nam
  +     ' đến ' + ngayCuoi + '/' + soThang + '/' + nam
  +     ' (Theo bảng nhật trình theo dõi hoạt động xe tháng ' + soThang + '/' + nam + ')</td>'
  +   '<td>' + (d.dinhMuc ? sovn(d.dinhMuc, 2) : '') + '</td>'
  +   '<td>' + (d.kmDau ? sovn(d.kmDau) : '') + '</td>'
  +   '<td>' + (d.kmCuoi ? sovn(d.kmCuoi) : '') + '</td>'
  +   '<td>' + (d.km ? sovn(d.km) : '') + '</td>'
  +   '<td>' + (d.tieuThuDinhMuc ? sovn(d.tieuThuDinhMuc) : '') + '</td><td></td></tr>'
  + '<tr class="bc-dam"><td>I</td><td class="bc-trai"></td><td colspan="4"></td>'
  +   '<td>' + sovn(d.tieuThuDinhMuc) + '</td><td></td></tr>'
  + '<tr class="bc-dam"><td>II</td><td class="bc-trai">Khối lượng xăng đã cấp</td>'
  +   '<td colspan="4"></td><td>' + soKT(d.daCap) + '</td><td></td></tr>'
  + '<tr><td></td><td class="bc-trai">&nbsp;&nbsp;- Khối lượng xăng đã mua trong tháng '
  +   '(đề nghị thanh toán)</td><td colspan="4"></td>'
  +   '<td>' + sovn(d.xangMua) + '</td><td></td></tr>'
  + '<tr><td></td><td class="bc-trai">&nbsp;&nbsp;- Khối lượng xăng tồn tháng trước</td>'
  +   '<td colspan="4"></td><td>' + (d.tonTruoc ? soKT(d.tonTruoc) : '-') + '</td><td></td></tr>'
  + '<tr class="bc-dam"><td>III</td>'
  +   '<td class="bc-trai">Khối lượng xăng tồn trong bình chứa tháng này: (III) = (II) - (I)</td>'
  +   '<td colspan="4"></td><td>' + soKT(d.tonCuoi) + '</td><td></td></tr>'
  + '</table>'
  + (d.dinhMuc
    ? '<table class="bc-bang bc-dinhmuc">'
      + '<tr><th colspan="3">Định mức tiêu thụ nhiên liệu xăng cho xe ' + esc(d.BienSo) + '</th></tr>'
      + '<tr><th>Stt</th><th>Nội dung</th><th>Định mức</th></tr>'
      + '<tr><td>1</td><td class="bc-trai">Định mức bình quân xe đi đường đồng bằng</td>'
      +   '<td>' + sovn(d.dinhMuc, 2) + '</td></tr></table>' : '')
  + khoiKyTen()
  + '</div>';
}

/** Ngày tháng và chỗ ký, xếp dọc ở nửa phải như bản giấy */
function khoiKyTen(){
  return '<div class="bc-ky"><div class="bc-ky-in">'
    + '<i>Hà Nội, ngày …… tháng …… năm ……</i>'
    + '<div class="bc-ky-box"><b>LÁI XE</b></div></div></div>';
}

/* ---------- Mẫu 2: nhật trình chi tiết ---------- */

function veNhatTrinh(r){
  var thg = S.bcThang.split('-');
  var tenXe = S.bcXe ? (xeTheoId(S.bcXe) || {}).BienSo : 'tất cả xe';

  if (!r.chuyen.length && !r.hoaDon.length){
    return '<p class="muted">Tháng ' + esc(S.bcThang) + ' chưa có chuyến nào kết thúc '
         + 'hoặc hoá đơn nào cho ' + esc(tenXe) + '.</p>';
  }
  var tKm = r.chuyen.reduce(function(s, c){ return s + c.km; }, 0);
  var tXang = r.hoaDon.filter(function(h){ return h.Loai === 'Xăng' || h.Loai === 'Dầu'; })
                      .reduce(function(s, h){ return s + (h.SoLuong || 0); }, 0);
  var tTien = r.hoaDon.reduce(function(s, h){ return s + (h.SoTien || 0); }, 0);

  return '<div class="bc-to">'
  + '<h2 class="bc-title">NHẬT TRÌNH HOẠT ĐỘNG XE</h2>'
  + '<p class="bc-sub">(Tháng ' + Number(thg[1]) + '/' + thg[0] + ' — ' + esc(tenXe) + ')</p>'
  + (r.chuyen.length
    ? '<div class="bc-cuon"><table class="bc-bang bc-nho">'
      + '<tr><th>Stt</th><th>Số phiếu</th><th>Ngày chạy</th><th>Giờ đi</th>'
      +   '<th>Giờ về<br>dự kiến</th><th>Giờ kết thúc<br>thực tế</th><th>Biển số</th><th>Lái xe</th>'
      +   '<th>Nội dung chuyến đi</th><th>Km đầu</th><th>Km cuối</th><th>Km chạy</th>'
      +   '<th>Xăng lấy<br>trong ngày (lít)</th><th>Hoá đơn</th></tr>'
      + r.chuyen.map(function(c, i){
          return '<tr><td>' + (i + 1) + '</td>'
            + '<td>' + esc(c.SoPhieu) + '</td>'
            + '<td>' + esc(c.ngay.slice(8) + '/' + c.ngay.slice(5, 7)) + '</td>'
            + '<td>' + esc(c.gioDi) + '</td>'
            + '<td>' + esc(c.gioVeDuKien) + '</td>'
            + '<td>' + esc(c.gioKetThuc || '—') + '</td>'
            + '<td>' + esc(c.BienSo) + '</td>'
            + '<td>' + esc(c.TaiXe || '—') + '</td>'
            + '<td class="bc-trai">' + esc(c.mucDich)
            +   '<div class="bc-phu">' + esc((c.diemDon || '—') + ' → ' + c.diemDen) + '</div></td>'
            + '<td>' + (c.kmDau ? sovn(c.kmDau) : '') + '</td>'
            + '<td>' + (c.kmCuoi ? sovn(c.kmCuoi) : '') + '</td>'
            + '<td>' + (c.km ? sovn(c.km) : '') + '</td>'
            + '<td>' + (c.xangChuyen ? sovn(c.xangChuyen, 2) : '') + '</td>'
            + '<td>' + esc(c.soHoaDonNgay || '') + '</td></tr>';
        }).join('')
      + '<tr class="bc-dam"><td colspan="11">Tổng km chạy trong tháng</td>'
      +   '<td>' + sovn(tKm) + '</td><td colspan="2"></td></tr>'
      + '</table></div>'
    : '<p class="muted">Tháng này chưa có chuyến nào kết thúc.</p>')

  + (r.hoaDon.length
    ? '<h3 class="bc-title2">Hoá đơn trong tháng</h3>'
      + '<div class="bc-cuon"><table class="bc-bang bc-nho">'
      + '<tr><th>Stt</th><th>Ngày</th><th>Biển số</th><th>Loại</th><th>Số hoá đơn</th>'
      +   '<th>Nhà cung cấp</th><th>Số lượng<br>(lít)</th><th>Đơn giá</th>'
      +   '<th>Thành tiền</th><th>Người nhập</th></tr>'
      + r.hoaDon.map(function(h, i){
          return '<tr><td>' + (i + 1) + '</td>'
            + '<td>' + esc(String(h.NgayHoaDon).slice(8) + '/' + String(h.NgayHoaDon).slice(5, 7)) + '</td>'
            + '<td>' + esc(h.BienSo) + '</td><td>' + esc(h.Loai) + '</td>'
            + '<td>' + esc(h.SoHoaDon || '') + '</td><td class="bc-trai">' + esc(h.NhaCungCap || '') + '</td>'
            + '<td>' + (h.SoLuong ? sovn(h.SoLuong, 2) : '') + '</td>'
            + '<td>' + (h.DonGia ? sovn(h.DonGia) : '') + '</td>'
            + '<td>' + sovn(h.SoTien) + '</td><td>' + esc(h.NguoiNhap || '') + '</td></tr>';
        }).join('')
      + '<tr class="bc-dam"><td colspan="6">Tổng cộng</td>'
      +   '<td>' + sovn(tXang, 2) + '</td><td></td>'
      +   '<td>' + sovn(tTien) + '</td><td></td></tr>'
      + '</table></div>'
    : '')
  + khoiKyTen()
  + '</div>';
}

/* ---------- Xuất Excel ----------
   Xuất CSV có dấu BOM: Excel mở thẳng, giữ đúng dấu tiếng Việt.
   Dùng dấu chấm phẩy vì Excel bản tiếng Việt coi dấu phẩy là dấu thập phân. */

function oCSV(v){
  v = String(v == null ? '' : v);
  return /[";\n]/.test(v) ? '"' + v.split('"').join('""') + '"' : v;
}

function taiExcelBaoCao(){
  var r = S.bcDuLieu;
  if (!r){ toast('Chưa có số liệu'); return; }
  var hang = [];

  if (S.bcLoai === 'nhattrinh'){
    hang.push(['NHẬT TRÌNH HOẠT ĐỘNG XE — tháng ' + r.thang]);
    hang.push([]);
    hang.push(['Stt','Số phiếu','Ngày chạy','Giờ đi','Giờ về dự kiến','Giờ kết thúc thực tế',
               'Biển số','Lái xe','Người đặt','Nội dung','Điểm đón','Điểm đến','Số người',
               'Km đầu','Km cuối','Km chạy','Xăng lấy trong ngày (lít)','Chi phí lẻ','Hoá đơn']);
    r.chuyen.forEach(function(c, i){
      hang.push([i+1, c.SoPhieu, c.ngay, c.gioDi, c.gioVeDuKien, c.gioKetThuc,
                 c.BienSo, c.TaiXe, c.nguoiDat, c.mucDich, c.diemDon, c.diemDen, c.soNguoi,
                 c.kmDau, c.kmCuoi, c.km, c.xangChuyen, c.chiPhiChuyen, c.soHoaDonNgay]);
    });
    hang.push([]);
    hang.push(['HOÁ ĐƠN TRONG THÁNG']);
    hang.push(['Stt','Ngày','Biển số','Loại','Số hoá đơn','Nhà cung cấp',
               'Số lượng (lít)','Đơn giá','Thành tiền','Người nhập','Ghi chú']);
    r.hoaDon.forEach(function(h, i){
      hang.push([i+1, h.NgayHoaDon, h.BienSo, h.Loai, h.SoHoaDon, h.NhaCungCap,
                 h.SoLuong, h.DonGia, h.SoTien, h.NguoiNhap, h.GhiChu]);
    });
  } else {
    hang.push(['BẢNG TÍNH NHIÊN LIỆU TIÊU THỤ THEO ĐỊNH MỨC — tháng ' + r.thang]);
    hang.push([]);
    hang.push(['Biển số','Loại xe','Lái xe','Định mức (lít/100km)',
               'Km đầu tháng','Km cuối tháng','Km đi trong tháng',
               'Xăng tiêu thụ theo định mức (I)','Xăng mua trong tháng',
               'Xăng tồn tháng trước','Xăng đã cấp (II)','Tồn trong bình (III)=(II)-(I)',
               'Tiền xăng đã mua','Số chuyến']);
    r.dong.forEach(function(d){
      hang.push([d.BienSo, d.TenXe || d.LoaiXe, d.TaiXe, d.dinhMuc,
                 d.kmDau, d.kmCuoi, d.km, d.tieuThuDinhMuc, d.xangMua,
                 d.tonTruoc, d.daCap, d.tonCuoi, d.tienXang, d.soChuyen]);
    });
  }

  var csv = hang.map(function(h){ return h.map(oCSV).join(';'); }).join('\r\n');
  var ten = (S.bcLoai === 'nhattrinh' ? 'Nhat-trinh-xe-' : 'Nhien-lieu-dinh-muc-')
          + r.thang + '.csv';
  taiBlobUrl_(URL.createObjectURL(
    new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })), ten);
  toast('Đã tải ' + ten + ' — mở bằng Excel');
}

/* =========================================================
   ĐĂNG KÝ PHÒNG HỌP
   Dùng lại khung lịch của tab xe: mỗi hàng một phòng,
   trục ngang là giờ trong ngày.
   ========================================================= */

var PH_MAU_XN = { 'Chờ duyệt':'#f59e0b', 'Đã duyệt':'#10b981',
                  'Từ chối':'#ef4444', 'Đã huỷ':'#94a3b8' };

function viewPhong(){
  var tab = S.phTab || 'lich';
  var nut = function(k, t){
    return '<button class="btn sm' + (tab === k ? ' primary' : '') + '"'
      + ' onclick="doiPhongTab(\'' + k + '\')">' + t + '</button>';
  };
  return '<div class="card"><h3 class="tab-dau" style="justify-content:space-between">🏛 Phòng họp'
    + '<span class="tab-nhom">'
    +   nut('lich','Lịch phòng') + nut('phieu','Phiếu') + nut('dsphong','Danh mục phòng')
    +   (chiDoc() ? '' : '<button class="btn primary sm" onclick="openDatPhongForm()">+ Đặt phòng</button>')
    + '</span></h3>'
    + '<div id="phBox">' + khungCho(4) + '</div></div>';
}

function doiPhongTab(k){ S.phTab = k; vePhongTab(); }

function loadPhong(){
  call('apiPhongDanhMuc', [S.token], function(r){
    if (!r || !r.ok) return;
    S.ph = r;
    vePhongTab();
  });
}

function phongTheoId(id){
  return (S.ph && S.ph.phong || []).filter(function(p){ return String(p.ID) === String(id); })[0];
}
function tenPhong(id){ var p = phongTheoId(id); return p ? p.Ten : ''; }
function phieuPhongTheoTask(taskId){
  return (S.ph && S.ph.phieu || []).filter(function(p){
    return String(p.TaskID) === String(taskId); })[0];
}
function dsPhieuPhong(){
  var tasks = {};
  S.tasks.forEach(function(t){ tasks[String(t.ID)] = t; });
  return (S.ph && S.ph.phieu || []).map(function(p){
    var t = tasks[String(p.TaskID)];
    return t ? { p: p, t: t } : null;
  }).filter(Boolean).sort(function(a, b){
    return a.p.GioBatDau < b.p.GioBatDau ? 1 : -1; });
}

function vePhongTab(){
  var box = document.getElementById('phBox');
  if (!box) return;
  box.classList.remove('muted');
  if (!S.ph){ box.innerHTML = khungCho(4); return; }
  var tab = S.phTab || 'lich';
  box.innerHTML = nhacDuyetPhong()
    + (tab === 'lich' ? veLichPhong() : tab === 'phieu' ? veDsPhieuPhong() : veDsPhong());
  donIcon(box);
}

/** Phiếu chờ duyệt chưa chiếm chỗ trên lịch nên phải nhắc riêng */
function nhacDuyetPhong(){
  if (!S.ph || !S.ph.quanLyDuoc) return '';
  var cho = dsPhieuPhong().filter(function(o){
    return o.p.XacNhan === 'Chờ duyệt' && o.t.TrangThai !== 'Hoàn thành'; });
  if (!cho.length) return '';
  return '<div class="xe-nhac"><div class="xe-nhac-dong">'
    + '<b>' + cho.length + ' phiếu</b> đang chờ bạn xếp phòng:'
    + cho.slice(0, 4).map(function(o){
        return ' <button class="btn sm" onclick="moPhieuPhong(\'' + o.t.ID + '\')">'
          + esc(o.p.SoPhieu) + ' · ' + esc(o.p.NoiDung.slice(0, 26)) + '</button>';
      }).join('')
    + (cho.length > 4 ? ' <span class="muted small">và ' + (cho.length - 4) + ' phiếu nữa</span>' : '')
    + '</div></div>';
}

/* ---------- Lịch phòng ---------- */

function veLichPhong(){
  var ds = S.ph.phong.filter(function(p){ return p.TrangThai !== 'Ngừng dùng'; });
  if (!ds.length){
    return '<p class="muted">Chưa khai báo phòng họp nào. Vào tab <b>Danh mục phòng</b> để thêm.</p>';
  }
  var ngay = S.phNgay || today();
  var gio = '';
  for (var h = XE_GIO_DAU; h <= XE_GIO_CUOI; h++){
    var lech = h === XE_GIO_DAU ? '0' : (h === XE_GIO_CUOI ? '-100%' : '-50%');
    gio += '<span class="xe-moc" style="left:' + pcXe(h * 60)
         + '%;transform:translateX(' + lech + ')">' + h + 'h</span>';
  }

  var cac = dsPhieuPhong().filter(function(o){
    return o.p.GioBatDau.slice(0, 10) <= ngay && o.p.GioKetThuc.slice(0, 10) >= ngay
        && o.t.TrangThai !== 'Hoàn thành' && o.p.PhongID
        && o.p.XacNhan !== 'Từ chối' && o.p.XacNhan !== 'Đã huỷ';
  });

  var hang = ds.map(function(ph){
    var cua = cac.filter(function(o){ return String(o.p.PhongID) === String(ph.ID); });
    var thanh = cua.map(function(o){
      var a = gioTrongNgay(o.p.GioBatDau, ngay, 0), b = gioTrongNgay(o.p.GioKetThuc, ngay, 1);
      var l = pcXe(a), w = Math.max(pcXe(b) - l, 2.5);
      var mau = PH_MAU_XN[o.p.XacNhan] || '#64748b';
      return '<button class="xe-bar' + (o.p.XacNhan === 'Chờ duyệt' ? ' cho' : '') + '"'
        + ' style="left:' + l + '%;width:' + w + '%;--m:' + mau + '"'
        + ' onclick="moPhieuPhong(\'' + o.t.ID + '\')"'
        + ' title="' + esc(o.p.SoPhieu + ' · ' + o.p.NoiDung + '\n'
            + o.p.GioBatDau.slice(11) + '–' + o.p.GioKetThuc.slice(11)
            + '\n' + o.p.SoNguoi + ' người · ' + o.p.XacNhan) + '">'
        + '<b>' + esc(o.p.NoiDung) + '</b> <span>' + esc(o.t.NguoiGiao) + '</span></button>';
    }).join('');
    var sua = ph.TrangThai === 'Đang sửa chữa'
      ? '<div class="xe-baoduong">đang sửa chữa</div>' : '';
    return '<div class="xe-hang">'
      + '<div class="xe-ten"><b>' + esc(ph.Ten) + '</b>'
      +   '<small>' + esc([ph.ViTri, ph.SucChua ? ph.SucChua + ' chỗ' : '']
            .filter(Boolean).join(' · ')) + '</small>'
      +   (ph.ThietBi ? '<small>' + esc(ph.ThietBi) + '</small>' : '')
      + '</div><div class="xe-track">' + sua + thanh + '</div></div>';
  }).join('');

  return '<div class="xe-dieu">'
    + '<button class="btn sm" onclick="phDoiNgay(-1)">‹ Hôm trước</button>'
    + '<b>' + ngayDaiVN(ngay) + '</b>'
    + '<button class="btn sm" onclick="phDoiNgay(1)">Hôm sau ›</button>'
    + '<button class="btn sm" onclick="phVeHomNay()">Hôm nay</button>'
    + '<span class="xe-chu"><i class="xe-o" style="background:#10b981"></i>đã duyệt'
    +   '<i class="xe-o" style="background:#f59e0b"></i>chờ xếp phòng</span>'
    + '</div>'
    + '<div class="scroll-x"><div class="xe-lich">'
    +   '<div class="xe-hang xe-dau"><div class="xe-ten"></div>'
    +     '<div class="xe-track">' + gio + '</div></div>' + hang
    + '</div></div>'
    + (cac.length ? '' : '<p class="muted small" style="padding:10px 0">'
        + 'Ngày này chưa có lịch họp nào.</p>');
}

function phDoiNgay(n){
  var p = String(S.phNgay || today()).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  S.phNgay = lymd(d); vePhongTab();
}
function phVeHomNay(){ S.phNgay = today(); vePhongTab(); }

/* ---------- Danh sách phiếu ---------- */

function veDsPhieuPhong(){
  var ds = dsPhieuPhong();
  if (!ds.length) return '<p class="muted">Chưa có phiếu đặt phòng nào.</p>';
  return '<div class="scroll-x"><table>'
    + '<tr><th>Số phiếu</th><th>Nội dung</th><th>Người đặt</th><th>Thời gian</th>'
    + '<th>Phòng</th><th>Số người</th><th>Trạng thái</th><th></th></tr>'
    + ds.map(function(o){
        var p = o.p, t = o.t;
        return '<tr><td><b class="mono-so">' + esc(p.SoPhieu) + '</b>'
          +   (S.soBinhLuan[t.ID] ? ' <span class="cmt-badge">💬 ' + S.soBinhLuan[t.ID] + '</span>' : '')
          + '</td>'
          + '<td>' + esc(p.NoiDung)
          +   (p.ThanhPhan ? '<div class="muted small">' + esc(p.ThanhPhan) + '</div>' : '') + '</td>'
          + '<td>' + avatarHtml(t.NguoiGiao) + ' ' + esc(t.NguoiGiao) + '</td>'
          + '<td class="mono-so">' + esc(p.GioBatDau.slice(5).replace('-','/')) + '<br>'
          +   esc(p.GioKetThuc.slice(11)) + '</td>'
          + '<td>' + (p.PhongID ? esc(tenPhong(p.PhongID)) : '<span class="muted">chưa xếp</span>') + '</td>'
          + '<td class="mono-so">' + p.SoNguoi + '</td>'
          + '<td>' + chip(p.XacNhan, PH_MAU_XN[p.XacNhan] || '#94a3b8') + '</td>'
          + '<td><button class="btn sm" onclick="moPhieuPhong(\'' + t.ID + '\')">Mở</button></td></tr>';
      }).join('') + '</table></div>';
}

/* ---------- Danh mục phòng ---------- */

function veDsPhong(){
  var sua = S.ph.quanLyDuoc, ds = S.ph.phong;
  return '<h3 style="justify-content:space-between;margin-top:4px">🏛 Danh mục phòng họp'
    + (sua ? '<button class="btn primary sm" onclick="openPhongForm()">+ Thêm phòng</button>' : '')
    + '</h3>'
    + (!ds.length
      ? '<p class="muted">Chưa có phòng nào.</p>'
      : '<div class="scroll-x"><table>'
        + '<tr><th>Tên phòng</th><th>Vị trí</th><th>Sức chứa</th><th>Thiết bị</th>'
        + '<th>Trạng thái</th>' + (sua ? '<th></th>' : '') + '</tr>'
        + ds.map(function(p){
            return '<tr><td><b>' + esc(p.Ten) + '</b></td>'
              + '<td>' + esc(p.ViTri || '—') + '</td>'
              + '<td class="mono-so">' + (p.SucChua || '—') + '</td>'
              + '<td>' + esc(p.ThietBi || '—') + '</td>'
              + '<td>' + chip(p.TrangThai, p.TrangThai === 'Sẵn sàng' ? '#10b981'
                  : (p.TrangThai === 'Đang sửa chữa' ? '#f59e0b' : '#94a3b8')) + '</td>'
              + (sua ? '<td style="white-space:nowrap">'
                  + '<button class="btn sm" onclick="openPhongForm(\'' + p.ID + '\')">Sửa</button> '
                  + '<button class="btn sm" onclick="xoaPhong(\'' + p.ID + '\')">Xoá</button></td>' : '')
              + '</tr>';
          }).join('') + '</table></div>')
    + (sua ? '' : '<p class="muted small" style="margin-top:14px">'
        + 'Chỉ Hành chính, Quản lý và Admin sửa được danh mục phòng.</p>');
}

function optPhong(chon, trong){
  return '<option value="">' + (trong || '— để hệ thống gợi ý —') + '</option>'
    + (S.ph && S.ph.phong || []).filter(function(p){ return p.TrangThai !== 'Ngừng dùng'; })
        .map(function(p){
          return '<option value="' + esc(p.ID) + '"' + (String(p.ID) === String(chon) ? ' selected' : '') + '>'
            + esc(p.Ten) + (p.SucChua ? ' · ' + p.SucChua + ' chỗ' : '')
            + (p.ViTri ? ' · ' + esc(p.ViTri) : '')
            + (p.TrangThai === 'Đang sửa chữa' ? ' (đang sửa)' : '') + '</option>';
        }).join('');
}

/* ---------- Biểu mẫu phòng họp ---------- */

function openDatPhongForm(){
  if (chiXem()){ toast('Tài khoản chỉ xem không đặt được phòng'); return; }
  if (!S.ph){ call('apiPhongDanhMuc', [S.token], function(r){ S.ph = r; openDatPhongForm(); }); return; }
  var mac = lymd(new Date(Date.now() + 86400000));

  openModal('<h3>🏛 Đặt phòng họp</h3>'
  + '<div class="field"><label>Nội dung cuộc họp *</label>'
  +   '<input id="dpNoiDung" placeholder="Ví dụ: Họp giao ban tuần phòng Kế toán"></div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Bắt đầu *</label>'
  +     '<input type="datetime-local" id="dpBatDau" value="' + mac + 'T08:30"></div>'
  +   '<div class="field"><label>Kết thúc *</label>'
  +     '<input type="datetime-local" id="dpKetThuc" value="' + mac + 'T10:00"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Số người dự</label>'
  +     '<input type="number" id="dpSoNguoi" min="1" value="5" oninput="dpGoiYPhong()"></div>'
  +   '<div class="field"><label>Phòng</label><select id="dpPhong">' + optPhong('') + '</select>'
  +     '<div class="small muted" style="margin-top:4px" id="dpGoiY">Để trống thì hệ thống '
  +     'chọn phòng trống nhỏ nhất đủ chỗ.</div></div>'
  + '</div>'
  + '<div class="field"><label>Thành phần tham dự</label>'
  +   '<input id="dpThanhPhan" placeholder="Ban Giám đốc, phòng Kế toán, khách mời..."></div>'
  + '<div class="field"><label>Cần chuẩn bị</label>'
  +   '<textarea id="dpChuanBi" rows="2" placeholder="Máy chiếu, nước, tài liệu in 10 bộ..."></textarea></div>'
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   '<button class="btn primary" onclick="luuDatPhong()">Gửi yêu cầu</button></div>', 'ngan');
  dpGoiYPhong();
}

/** Nhắc ngay nếu phòng đang chọn không đủ chỗ */
function dpGoiYPhong(){
  var e = document.getElementById('dpGoiY');
  if (!e) return;
  var n = Number(vGt('dpSoNguoi')) || 1;
  var hop = (S.ph.phong || []).filter(function(p){
    return p.TrangThai === 'Sẵn sàng' && (!p.SucChua || p.SucChua >= n); });
  e.innerHTML = hop.length
    ? 'Có ' + hop.length + ' phòng đủ ' + n + ' chỗ. Để trống thì hệ thống chọn phòng nhỏ nhất còn trống.'
    : '<span style="color:var(--warn)">Không phòng nào đủ ' + n + ' chỗ — hành chính sẽ xếp thủ công.</span>';
}

function luuDatPhong(){
  if (!vGt('dpNoiDung').trim()){ toast('Nhập nội dung cuộc họp'); return; }
  if (!vGt('dpBatDau') || !vGt('dpKetThuc')){ toast('Chọn giờ bắt đầu và kết thúc'); return; }

  call('apiDatPhong', [S.token, {
    NoiDung: vGt('dpNoiDung').trim(), PhongID: vGt('dpPhong'),
    GioBatDau: dtGui(vGt('dpBatDau')), GioKetThuc: dtGui(vGt('dpKetThuc')),
    SoNguoi: vGt('dpSoNguoi'), ThanhPhan: vGt('dpThanhPhan'),
    ChuanBi: vGt('dpChuanBi')
  }], function(r){
    if (!r.ok){
      if (r.trung && r.trung.length){
        toast(r.msg + ' — ' + r.trung.map(function(c){ return c.SoPhieu + ' (' + c.NguoiDat + ')'; }).join(', '));
      } else toast(r.msg);
      return;
    }
    closeModal();
    toast('Đã gửi phiếu ' + r.so + (r.canhBao ? ' — ' + r.canhBao : ''));
    S.view = 'phong'; S.phTab = 'phieu';
    loadPhong(); reload();
  });
}

function moPhieuPhong(taskId){
  var p = phieuPhongTheoTask(taskId);
  var t = S.tasks.filter(function(x){ return String(x.ID) === String(taskId); })[0];
  if (!p || !t){ toast('Không tìm thấy phiếu'); return; }

  var ph = phongTheoId(p.PhongID);
  var ql = S.ph.quanLyDuoc;
  var xong = t.TrangThai === 'Hoàn thành';
  var laNguoiDat = t.NguoiGiao === S.me.Ten;

  var dong = function(nhan, gt){
    return '<div class="xe-dong"><span class="muted">' + nhan + '</span><b>' + gt + '</b></div>';
  };
  var nut = '';
  if (!xong && ql && p.XacNhan !== 'Đã duyệt'){
    nut += '<button class="btn primary" onclick="openXepPhongForm(\'' + taskId + '\')">Xếp phòng</button>'
         + '<button class="btn" onclick="tuChoiPhong(\'' + taskId + '\')">Từ chối</button>';
  }
  if (!xong && ql && p.XacNhan === 'Đã duyệt'){
    nut += '<button class="btn" onclick="openXepPhongForm(\'' + taskId + '\')">Đổi phòng</button>';
  }
  if (!xong && p.XacNhan === 'Đã duyệt' && (laNguoiDat || ql)){
    nut += '<button class="btn primary" onclick="ketThucHop(\'' + taskId + '\')">Kết thúc cuộc họp</button>';
  }
  if (!xong && (laNguoiDat || ql)){
    nut += '<button class="btn" onclick="huyPhong(\'' + taskId + '\')">Huỷ đặt phòng</button>';
  }

  openModal('<h3>🏛 Phiếu ' + esc(p.SoPhieu) + '</h3>'
  + '<div class="xe-bang">'
  +   dong('Nội dung', esc(p.NoiDung))
  +   dong('Thời gian', esc(p.GioBatDau + ' → ' + p.GioKetThuc.slice(11)))
  +   dong('Số người dự', p.SoNguoi)
  +   dong('Người đặt', avatarHtml(t.NguoiGiao) + ' ' + esc(t.NguoiGiao))
  +   dong('Phòng', ph
        ? esc(ph.Ten) + (ph.ViTri ? ' <span class="muted">· ' + esc(ph.ViTri) + '</span>' : '')
          + (ph.SucChua ? ' <span class="muted">· ' + ph.SucChua + ' chỗ</span>' : '')
        : '<span class="muted">chưa xếp phòng</span>')
  +   (ph && ph.ThietBi ? dong('Thiết bị', esc(ph.ThietBi)) : '')
  +   (p.ThanhPhan ? dong('Thành phần', esc(p.ThanhPhan)) : '')
  +   (p.ChuanBi ? dong('Cần chuẩn bị', esc(p.ChuanBi)) : '')
  +   dong('Trạng thái', chip(p.XacNhan, PH_MAU_XN[p.XacNhan] || '#94a3b8'))
  +   (p.LyDoTuChoi ? dong('Lý do từ chối',
        '<span style="color:var(--danger)">' + esc(p.LyDoTuChoi) + '</span>') : '')
  + '</div>'
  + khoiTraoDoi(taskId)
  + '<div class="modal-foot" style="flex-wrap:wrap">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   '<button class="btn" onclick="closeModal();openTaskForm(\'' + taskId + '\')">Mở dạng công việc</button>'
  +   nut + '</div>', 'ngan');

  S.formDangMo = function(){ moPhieuPhong(taskId); };
  moTraoDoi(taskId);
}

function openXepPhongForm(taskId, lyDoGanDe, trung){
  var p = phieuPhongTheoTask(taskId);
  if (!p) return;
  var canhBao = '';
  if (trung && trung.length){
    canhBao = '<div class="xe-canh"><b>⚠️ Phòng này đã có lịch được duyệt trong khung giờ đó</b><ul>'
      + trung.map(function(c){
          return '<li>' + esc(c.SoPhieu + ' · ' + c.NguoiDat + ' · '
            + c.GioBatDau.slice(11) + '–' + c.GioKetThuc.slice(11) + ' · ' + c.NoiDung) + '</li>';
        }).join('') + '</ul>'
      + (['Admin','Manage'].indexOf(S.me.VaiTro) >= 0
          ? '<div class="field"><label>Lý do xếp đè *</label>'
            + '<input id="xpLyDo" placeholder="Vì sao vẫn xếp phòng này?"></div>'
          : '<p class="muted small">Chỉ Admin hoặc Quản lý mới xếp đè được. Hãy chọn phòng khác.</p>')
      + '</div>';
  }
  openModal('<h3>' + (p.PhongID ? 'Đổi phòng cho ' : 'Xếp phòng cho ') + esc(p.SoPhieu) + '</h3>'
  + '<p class="muted small">' + esc(p.NoiDung) + ' — ' + esc(p.GioBatDau)
  +   ' → ' + esc(p.GioKetThuc.slice(11)) + ' · ' + p.SoNguoi + ' người</p>'
  + canhBao
  + '<div class="field"><label>Phòng *</label><select id="xpPhong">'
  +   optPhong(p.PhongID, '— chọn phòng —') + '</select></div>'
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="moPhieuPhong(\'' + taskId + '\')">Quay lại</button>'
  +   '<button class="btn primary" onclick="luuXepPhong(\'' + taskId + '\')">'
  +     (trung && trung.length ? 'Vẫn xếp phòng này' : 'Xếp phòng') + '</button></div>');
}

function luuXepPhong(taskId){
  var phongId = vGt('xpPhong');
  if (!phongId){ toast('Chọn phòng'); return; }
  var lyDo = vGt('xpLyDo');
  call('apiDuyetDatPhong', [S.token, taskId, phongId, lyDo], function(r){
    if (!r.ok){
      if (r.trung && r.trung.length){
        if (lyDo && !r.canLyDo){ toast(r.msg); return; }
        openXepPhongForm(taskId, lyDo, r.trung);
        if (lyDo) toast(r.msg);
        return;
      }
      toast(r.msg); return;
    }
    closeModal(); toast('Đã xếp phòng và báo cho người đặt'); loadPhong(); reload();
  });
}

function tuChoiPhong(taskId){
  var ly = prompt('Lý do không xếp được phòng:');
  if (ly === null) return;
  if (!String(ly).trim()){ toast('Phải ghi lý do'); return; }
  call('apiTuChoiDatPhong', [S.token, taskId, String(ly).trim()], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã trả lại phiếu'); loadPhong(); reload();
  });
}

function huyPhong(taskId){
  var ly = prompt('Lý do huỷ (có thể bỏ trống):');
  if (ly === null) return;
  call('apiHuyDatPhong', [S.token, taskId, String(ly || '').trim()], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã huỷ đặt phòng'); loadPhong(); reload();
  });
}

function ketThucHop(taskId){
  call('apiKetThucHop', [S.token, taskId], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã kết thúc, phòng được trả lại'); loadPhong(); reload();
  });
}

function openPhongForm(id){
  var p = (S.ph.phong || []).filter(function(x){ return String(x.ID) === String(id); })[0] || {};
  openModal('<h3>' + (id ? 'Sửa phòng họp' : 'Thêm phòng họp') + '</h3>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Tên phòng *</label>'
  +     '<input id="pfTen" value="' + esc(p.Ten || '') + '" placeholder="Phòng họp lớn"></div>'
  +   '<div class="field"><label>Vị trí</label>'
  +     '<input id="pfViTri" value="' + esc(p.ViTri || '') + '" placeholder="Tầng 5"></div>'
  + '</div>'
  + '<div class="form-grid">'
  +   '<div class="field"><label>Sức chứa (người)</label>'
  +     '<input type="number" min="0" id="pfSucChua" value="' + (p.SucChua || '') + '"></div>'
  +   '<div class="field"><label>Trạng thái</label><select id="pfTrangThai">'
  +     ['Sẵn sàng','Đang sửa chữa','Ngừng dùng'].map(function(v){
            return '<option' + (v === (p.TrangThai || 'Sẵn sàng') ? ' selected' : '') + '>' + v + '</option>';
          }).join('') + '</select></div>'
  + '</div>'
  + '<div class="field"><label>Thiết bị sẵn có</label>'
  +   '<input id="pfThietBi" value="' + esc(p.ThietBi || '') + '"'
  +   ' placeholder="Máy chiếu, bảng trắng, hệ thống họp trực tuyến..."></div>'
  + '<div class="field"><label>Ghi chú</label>'
  +   '<textarea id="pfGhiChu" rows="2">' + esc(p.GhiChu || '') + '</textarea></div>'
  + '<div class="modal-foot">'
  +   '<button class="btn" onclick="closeModal()">Đóng</button>'
  +   '<button class="btn primary" onclick="luuPhong(\'' + (id || '') + '\')">Lưu</button></div>');
}

function luuPhong(id){
  call('apiLuuPhong', [S.token, {
    ID: id, Ten: vGt('pfTen'), ViTri: vGt('pfViTri'), SucChua: vGt('pfSucChua'),
    ThietBi: vGt('pfThietBi'), TrangThai: vGt('pfTrangThai'), GhiChu: vGt('pfGhiChu')
  }], function(r){
    if (!r.ok){ toast(r.msg); return; }
    closeModal(); toast('Đã lưu phòng'); loadPhong();
  });
}

function xoaPhong(id){
  var p = phongTheoId(id);
  if (!confirm('Xoá phòng "' + (p ? p.Ten : '') + '" khỏi danh mục?')) return;
  call('apiXoaPhong', [S.token, id], function(r){
    if (!r.ok){ toast(r.msg); return; }
    toast('Đã xoá phòng'); loadPhong();
  });
}

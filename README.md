# Task Pro — tệp giao diện tĩnh

Kho này chỉ chứa **tệp giao diện** (CSS và JS) của web app Task Pro, để trình
duyệt tải qua CDN jsDelivr thay vì nhúng thẳng vào trang do Apps Script trả về.
Mục đích duy nhất là **giảm thời gian tải trang**.

## Ở đây KHÔNG có gì nhạy cảm

- Không có dữ liệu công việc, người dùng, xe, phiếu hay tin nhắn.
- Không có khoá API, mật khẩu hay mã truy cập. Những thứ đó nằm trong
  Script Properties và Google Sheet riêng của công ty, không bao giờ ra đây.
- Không có mã máy chủ (`.gs`) — toàn bộ phân quyền và truy cập dữ liệu
  vẫn chạy phía Apps Script.

## Đừng sửa tay ở đây

Nguồn sự thật là các tệp `.html` trong thư mục `apps-script/` của dự án.
Thư mục này là **bản dựng**, sinh ra bằng `tach-tep.py`. Sửa tay ở đây sẽ bị
ghi đè ở lần triển khai sau.

## Cách dùng

Mỗi lần triển khai sẽ gắn một thẻ phiên bản (`v1`, `v2`, ...). Trang nạp theo
thẻ cố định để jsDelivr cache được **một năm**:

```
https://cdn.jsdelivr.net/gh/<tài khoản>/<kho>@v1/styles.css
```

Nếu CDN không truy cập được, trang tự quay về nạp từ chính Apps Script.

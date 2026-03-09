# REQ-1: Ma Sói Web App — Host & Player Real-time Support
**Tier:** standard | **Created:** 2026-03-08 17:40 UTC

## Requirements
## Tổng quan
Web app hỗ trợ chơi Ma Sói trực tiếp (in-person), gồm hai giao diện riêng biệt: màn hình quản trò và màn hình người chơi. Giao tiếp real-time giữa các thiết bị. Không cần đăng nhập, không lưu lịch sử ván chơi.

## Luồng trước ván chơi
- Quản trò tạo phòng mới, được cấp mã phòng duy nhất.
- Quản trò cấu hình bộ vai linh hoạt: chọn tổng số người chơi, sau đó phân bổ số lượng từng vai (Sói, Dân thường, Tiên tri, Thầy thuốc, Phù thủy, Thợ săn, v.v.). App validate tổng số vai khớp với số người chơi.
- App sinh QR code tương ứng với link phòng. Người chơi dùng điện thoại quét QR, truy cập link, nhập tên hiển thị và join phòng.
- Quản trò thấy danh sách người chơi đã join real-time. Khi đủ số lượng, quản trò bấm "Bắt đầu ván".

## Phân vai
- App tự động chia vai ngẫu nhiên cho từng người chơi.
- Mỗi người chơi chỉ thấy đúng vai của mình trên điện thoại (có thể bấm để xem lại bất cứ lúc nào trong ván).
- Quản trò thấy toàn bộ danh sách: tên người chơi + vai tương ứng.

## Quản lý pha ban đêm
- App hiển thị hướng dẫn từng bước cho quản trò theo đúng thứ tự các vai thức dậy (ví dụ: Sói → Tiên tri → Thầy thuốc → ...).
- Quản trò điều hành miệng như bình thường, sau đó nhập kết quả hành động vào app: chọn nạn nhân của Sói, chọn người Tiên tri soi và nhập kết quả (Sói / Không phải Sói), chọn người Thầy thuốc cứu, v.v.
- App lưu trạng thái nội bộ, không hiển thị thông tin nhạy cảm ra màn hình người chơi trong pha đêm.

## Quản lý pha ban ngày
- Khi chuyển sang ngày, app thông báo kết quả đêm ra màn hình tất cả người chơi (ai bị giết, ai được cứu, v.v.) theo cách kiểm soát được — quản trò chủ động bấm "Công bố kết quả".
- Quản trò quản lý danh sách alive/dead, có thể đánh dấu người chết thủ công nếu cần.
- Khi bầu chọn treo cổ: quản trò mở phiên vote, người chơi còn sống chọn 1 người trên điện thoại. Người đã chết thấy giao diện spectator (xem diễn biến, thấy kết quả vote nhưng không thể bỏ phiếu). App đếm và hiển thị kết quả vote real-time trên cả hai màn hình.
- Quản trò xác nhận treo cổ, app cập nhật trạng thái.

## Kết thúc ván
- App tự động kiểm tra điều kiện thắng sau mỗi hành động (Sói bị tiêu diệt hết → Dân thắng; Sói >= Dân còn lại → Sói thắng).
- Khi có phe thắng, app hiển thị màn hình kết thúc cho tất cả: phe thắng, reveal toàn bộ vai của mọi người.
- Quản trò có thể tạo ván mới hoặc kết thúc phòng.

## Yêu cầu kỹ thuật
- Real-time sync giữa tất cả thiết bị trong cùng phòng (WebSocket hoặc tương đương).
- Hỗ trợ nhiều phòng đồng thời, độc lập nhau.
- Giao diện mobile-first cho người chơi (dùng điện thoại), giao diện desktop/tablet cho quản trò.
- Không cần đăng nhập, không lưu dữ liệu sau khi ván kết thúc.
- Phòng tự động giải phóng sau một khoảng thời gian không hoạt động.

## Acceptance Criteria
- Quản trò tạo phòng, cấu hình vai, sinh QR trong vòng 1 phút.
- 10–15 người chơi join cùng lúc không bị lỗi, không bị nhận trùng vai.
- Hành động ban đêm của quản trò phản ánh đúng lên trạng thái game, không lộ thông tin ra phía người chơi.
- Vote ban ngày đồng bộ real-time, kết quả chính xác, người chết không vote được.
- App phát hiện đúng điều kiện thắng và kết thúc ván.
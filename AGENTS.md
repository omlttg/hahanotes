# AGENTS.md — hahanotes

> **Nguồn chân lý duy nhất (Single source of truth) cho tất cả AI Agent. Bạn PHẢI đọc, hiểu và tuân thủ nghiêm ngặt quy trình làm việc này trước khi viết bất kỳ mã nguồn nào.**

---

## 🚀 QUY TRÌNH PHỐI HỢP VIBE CODE + OUSTERHOUT (ĐỘNG CƠ 5 BƯỚC TRÊN GITHUB ISSUES)

### 1️⃣ Bước 1: Đồng bộ & Thống nhất (Phỏng vấn sâu)
- **Đầu vào (Input):** Bắt đầu bằng một yêu cầu thô từ User (thông qua mô tả của GitHub Issue hoặc trao đổi trực tiếp).
- **Hành động của Agent:** 
  * Đọc yêu cầu đầu vào và xây dựng một "cây thiết kế" (design tree) trong tâm trí.
  * Phỏng vấn Người dùng một cách kỹ lượng bằng cách đặt ít nhất 3-5 câu hỏi sắc bén, không hiển nhiên nhằm làm rõ thiết kế.
  * *Mục tiêu:* Đạt được "sự hiểu biết chung" giữa người và máy trước khi viết một dòng code nào.

### 2️⃣ Bước 2: Xác định Điểm đến (Viết PRD)
- **Hành động của Agent:** Tổng hợp sự hiểu biết chung từ Bước 1 thành một Tài liệu Yêu cầu Sản phẩm (PRD).
- **Lưu trữ:** Tạo hoặc cập nhật mô tả của một Issue chính (Epic Issue) trên GitHub bằng GitHub CLI (`gh issue create` hoặc `gh issue edit`) để lưu PRD này. **TUYỆT ĐỐI KHÔNG tạo file PRD trong source code**.
- **Tích hợp Ousterhout:** Trong PRD, Agent PHẢI định nghĩa rõ ràng:
  * Phát biểu bài toán và giải pháp đơn giản nhất có thể (Giảm thiểu độ phức tạp - Complexity Reduction).
  * Thiết kế các **Module Sâu (Deep Modules)**: Định nghĩa các giao diện (interface) sạch sẽ, đơn giản để che giấu độ phức tạp triển khai lớn bên dưới (Ẩn giấu thông tin - Information Hiding).
  * Làm cho các giao diện có tính tổng quát nhất định để tạo điều kiện mở rộng trong tương lai và tránh tình trạng "Lạm dụng phân mảnh lớp" (Class-itis).

### 3️⃣ Bước 3: Lập bản đồ Hành trình (PRD sang Issue)
- **Hành động của Agent:** Phân rã PRD thành các GitHub Issues con (hoặc Task List thuộc Epic Issue) sử dụng GitHub CLI.
- **Quy tắc phân rã:**
  * Chia nhỏ các tác vụ thành các **"Lát cắt dọc" (Tracer Bullets)** đi qua tất cả các lớp của hệ thống (từ Cơ sở dữ liệu, API đến Giao diện người dùng) thay vì các lớp ngang. Điều này đảm bảo nhận được phản hồi ngay lập tức.
  * Áp dụng nguyên tắc **"Định nghĩa triệt tiêu lỗi" (Define errors out of existence)** sớm trong giai đoạn thiết kế giao diện/API. Thiết kế các luồng xử lý thông thường để tự nhiên xử lý các bất thường mà không cần ném ra các exception lộn xộn.

### 4️⃣ Bước 4: Thực thi Tự động (Vòng lặp AFK & TDD)
- **Hành động của Agent:** Tự động tiếp nhận các GitHub Issues không bị chặn.
- **Vòng lặp viết code:**
  * **Viết bình luận trước (Ousterhout):** Viết các bình luận giải thích "TẠI SAO" (ý đồ thiết kế/lý do cốt lõi) và mô tả giao diện trước khi viết mã nguồn triển khai thực tế.
  * **Vòng lặp TDD:** Viết một kiểm thử thất bại (Đỏ) ➔ Viết mã triển khai tối thiểu để vượt qua kiểm thử (Xanh) ➔ Tối ưu hóa/Tái cấu trúc (Refactor).
  * **Chế độ Momento (Đặt lại Context):** **Bạn PHẢI xóa context của LLM sau khi hoàn thành và đóng mỗi Issue**. Phiên làm việc của agent tiếp theo phải bắt đầu với một context sạch để tránh rơi vào "Vùng trì trệ" (Vùng dại khờ - Dumb zone).
- **Học chéo & Cập nhật bài học:** Trước khi đóng Issue, Agent phải trích xuất các bài học/gotchas rút ra được và lưu chúng vào thư mục tri thức chung qua symlink `global_brain` (trỏ đến `../../AgentRoot/knowledge_base/`).

### 5️⃣ Bước 5: Đơn giản hóa Kiến trúc (Cải thiện Kiến trúc Codebase)
- **Hành động của Agent:** Định kỳ quét codebase để:
  * Phát hiện và loại bỏ các "Module Nông" (Shallow Modules) do chia nhỏ quá mức ("Class-itis").
  * Hợp nhất chúng thành các "Module Sâu" (Deep Modules) với giao diện cực kỳ sạch sẽ.
  * Loại bỏ các phụ thuộc không cần thiết và giảm độ tối nghĩa (obscurity) của codebase.

---

## 📂 NHẬT KÝ QUYẾT ĐỊNH & CHIA SẺ KIẾN THỨC

- **Nhật ký Tác vụ/Phiên làm việc:** Được cập nhật và duy trì trong tệp phẳng [HANDOFF.md](file:///home/thienvu/workspace/DevChallenge/hahanotes/HANDOFF.md) tại thư mục gốc của workspace. Không tạo các đặc tả cục bộ hoặc danh sách tác vụ riêng lẻ bên trong kho lưu trữ này.
- **Kiến thức Chung & Học hỏi Chéo:** Được tham chiếu qua thư mục [global_brain](file:///home/thienvu/workspace/DevChallenge/hahanotes/global_brain/) (liên kết tượng trưng trỏ đến `../../AgentRoot/knowledge_base/`). Đọc kỹ các bẫy thường gặp (pitfalls), tiêu chuẩn và nguyên tắc thiết kế chung trước khi viết code.

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

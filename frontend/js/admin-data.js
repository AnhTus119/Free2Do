/*
 * Nguồn dữ liệu dùng chung cho giao diện quản trị FREE2DO.
 * Khi có backend/API, chỉ cần thay phần dữ liệu trong file này bằng fetch().
 */
(function () {
  'use strict';

  const customers = [
    { id: 'C001', name: 'Hoàng Minh', email: 'hoangminh@gmail.com', phone: '0987 654 321', area: 'Hai Bà Trưng, Hà Nội', registeredAt: '08/09/2026', lastLogin: 'Hôm nay, 09:12', status: 'active', interests: ['Workshop', 'Ăn uống', 'Giải trí'] },
    { id: 'C002', name: 'Lê Thu', email: 'lethu99@gmail.com', phone: '0912 340 102', area: 'Đống Đa, Hà Nội', registeredAt: '08/09/2026', lastLogin: 'Hôm nay, 08:45', status: 'active', interests: ['Làm đẹp', 'Workshop'] },
    { id: 'C003', name: 'Phạm Đức', email: 'ducpham@gmail.com', phone: '0936 220 303', area: 'Cầu Giấy, Hà Nội', registeredAt: '07/09/2026', lastLogin: 'Hôm qua, 21:05', status: 'active', interests: ['Thể thao', 'Giải trí'] },
    { id: 'C004', name: 'Trần Bảo Ngọc', email: 'ngoctb@gmail.com', phone: '0904 440 404', area: 'Thanh Xuân, Hà Nội', registeredAt: '05/09/2026', lastLogin: '05/09/2026, 18:20', status: 'locked', interests: ['Ăn uống'] },
    { id: 'C005', name: 'Nguyễn Gia Bảo', email: 'baonguyen@gmail.com', phone: '0985 550 505', area: 'Nam Từ Liêm, Hà Nội', registeredAt: '03/09/2026', lastLogin: 'Hôm nay, 07:30', status: 'active', interests: ['Thể thao', 'Xem phim'] },
    { id: 'C006', name: 'Đỗ Khánh Linh', email: 'linhdk@gmail.com', phone: '0916 660 606', area: 'Hoàng Mai, Hà Nội', registeredAt: '01/09/2026', lastLogin: 'Hôm qua, 20:12', status: 'active', interests: ['Workshop', 'Làm đẹp'] },
    { id: 'C007', name: 'Vũ Anh Tuấn', email: 'tuanva@gmail.com', phone: '0977 770 707', area: 'Long Biên, Hà Nội', registeredAt: '29/08/2026', lastLogin: '29/08/2026, 16:40', status: 'locked', interests: ['Giải trí'] },
    { id: 'C008', name: 'Mai Ngọc Anh', email: 'maianh@gmail.com', phone: '0988 880 808', area: 'Ba Đình, Hà Nội', registeredAt: '27/08/2026', lastLogin: 'Hôm nay, 10:10', status: 'active', interests: ['Ăn uống', 'Không gian đọc'] },
    { id: 'C009', name: 'Đặng Minh Quân', email: 'minhquan@gmail.com', phone: '0909 990 909', area: 'Tây Hồ, Hà Nội', registeredAt: '25/08/2026', lastLogin: 'Hôm qua, 22:30', status: 'active', interests: ['Xem phim', 'Thể thao'] },
    { id: 'C010', name: 'Bùi Thanh Hà', email: 'thanhha@gmail.com', phone: '0910 101 010', area: 'Hai Bà Trưng, Hà Nội', registeredAt: '23/08/2026', lastLogin: '20/09/2026, 11:25', status: 'active', interests: ['Workshop'] },
    { id: 'C011', name: 'Phan Nhật Nam', email: 'nhatnam@gmail.com', phone: '0921 111 111', area: 'Cầu Giấy, Hà Nội', registeredAt: '21/08/2026', lastLogin: '19/09/2026, 14:10', status: 'active', interests: ['Giải trí', 'Ăn uống'] },
    { id: 'C012', name: 'Nguyễn Thùy Dương', email: 'thuyduong@gmail.com', phone: '0932 222 212', area: 'Đống Đa, Hà Nội', registeredAt: '19/08/2026', lastLogin: 'Hôm nay, 06:45', status: 'active', interests: ['Làm đẹp', 'Yoga'] },
    { id: 'C013', name: 'Trịnh Hoàng Long', email: 'hoanglong@gmail.com', phone: '0943 333 313', area: 'Hoàng Mai, Hà Nội', registeredAt: '17/08/2026', lastLogin: '17/08/2026, 12:00', status: 'locked', interests: ['Giải trí'] },
    { id: 'C014', name: 'Lý Hoài An', email: 'hoaian@gmail.com', phone: '0954 444 414', area: 'Thanh Xuân, Hà Nội', registeredAt: '15/08/2026', lastLogin: '21/09/2026, 19:05', status: 'active', interests: ['Workshop', 'Ăn uống'] },
    { id: 'C015', name: 'Võ Gia Hân', email: 'giahan@gmail.com', phone: '0965 555 515', area: 'Hà Đông, Hà Nội', registeredAt: '13/08/2026', lastLogin: '20/09/2026, 08:18', status: 'active', interests: ['Làm đẹp', 'Xem phim'] },
    { id: 'C016', name: 'Cao Đức Anh', email: 'ducanh@gmail.com', phone: '0976 666 616', area: 'Nam Từ Liêm, Hà Nội', registeredAt: '11/08/2026', lastLogin: '18/09/2026, 17:55', status: 'active', interests: ['Thể thao'] },
    { id: 'C017', name: 'Phạm Khánh Vy', email: 'khanhvy@gmail.com', phone: '0987 777 717', area: 'Ba Đình, Hà Nội', registeredAt: '09/08/2026', lastLogin: 'Hôm qua, 15:35', status: 'active', interests: ['Workshop', 'Làm đẹp'] },
    { id: 'C018', name: 'Hồ Quốc Bảo', email: 'quocbao@gmail.com', phone: '0998 888 818', area: 'Long Biên, Hà Nội', registeredAt: '07/08/2026', lastLogin: '07/08/2026, 09:30', status: 'locked', interests: ['Giải trí'] },
    { id: 'C019', name: 'Đinh Mai Chi', email: 'maichi@gmail.com', phone: '0909 999 919', area: 'Tây Hồ, Hà Nội', registeredAt: '05/08/2026', lastLogin: '17/09/2026, 10:40', status: 'active', interests: ['Không gian đọc', 'Ăn uống'] },
    { id: 'C020', name: 'Lê Quang Huy', email: 'quanghuy@gmail.com', phone: '0910 000 020', area: 'Cầu Giấy, Hà Nội', registeredAt: '03/08/2026', lastLogin: '16/09/2026, 23:15', status: 'active', interests: ['Thể thao', 'Giải trí'] },
    { id: 'C021', name: 'Ngô Hà My', email: 'hamy@gmail.com', phone: '0921 010 121', area: 'Đống Đa, Hà Nội', registeredAt: '01/08/2026', lastLogin: 'Hôm nay, 11:02', status: 'active', interests: ['Workshop', 'Làm đẹp'] }
  ];

  const businesses = [
    { id: 'B001', name: 'She.slays', address: 'Xưởng Cafe, Bạch Mai, Hà Nội', type: 'Workshop', phone: '0988 111 001', hours: '09:00 – 21:00', priceRange: '200.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Không gian tổ chức workshop thủ công và sáng tạo tại Hà Nội.' },
    { id: 'B002', name: 'Fitness', address: '81B Bùi Thị Xuân, Hà Nội', type: 'Gym', phone: '0988 111 002', hours: '06:00 – 21:30', priceRange: '150.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Phòng tập thể hình với huấn luyện viên và thiết bị hiện đại.' },
    { id: 'B004', name: 'Vikings Cyber', address: '3 chi nhánh · Hà Nội', type: 'Quán net — Esports Arena', phone: '0793 002 247', hours: 'Cả ngày', priceRange: '100.000 ₫', status: 'active', verifiedBy: '', description: 'Chuỗi quán net Esports Arena phục vụ game thủ, mở cửa cả ngày, hiện có 3 chi nhánh tại Hà Nội.' },
    { id: 'B010', name: 'Bi-a Batuna Billiards', address: '72 Trần Đại Nghĩa, Hà Nội', type: 'Giải trí', phone: '0988 111 010', hours: 'Cả ngày', priceRange: '100.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Không gian billiards dành cho nhóm bạn và người chơi chuyên nghiệp.' },
    { id: 'B012', name: 'KATINAT Lê Thanh Nghị', address: '67 P. Lê Thanh Nghị, Hà Nội', type: 'Quán cà phê', phone: '0988 111 012', hours: '07:00 – 23:00', priceRange: '45.000 – 90.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Quán cà phê phục vụ đồ uống và không gian gặp gỡ.' },
    { id: 'B015', name: 'Rạp Beta Giải Phóng', address: '360 Đ. Giải Phóng, Hà Nội', type: 'Xem phim', phone: '024 3868 1234', hours: '09:00 – 23:00', priceRange: '50.000 – 70.000 ₫', status: 'pending', verifiedBy: '', description: 'Cụm rạp chiếu phim thương mại với nhiều suất chiếu mỗi ngày.' },
    { id: 'B017', name: 'HaPam Nails House', address: '18 Ng.41 P.Đông Tác, Hà Nội', type: 'Làm đẹp', phone: '0988 111 017', hours: '09:00 – 22:00', priceRange: '120.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Cửa hàng chăm sóc móng và làm đẹp.' },
    { id: 'B021', name: 'Thổ thì thầm Pottery workshop', address: '435a Đ. Giải Phóng, Hà Nội', type: 'Workshop / Cà phê nghệ thuật', phone: '0955 123 456', hours: '08:30 – 20:00', priceRange: '200.000 – 300.000 ₫', status: 'pending', verifiedBy: '', description: 'Xưởng gốm thủ công kết hợp không gian cà phê nghệ thuật.' },
    { id: 'B025', name: 'Cà Phê Nhà Kho Đại La', address: 'Ngách 51 Ng.128C, Bạch Mai', type: 'Quán cà phê học tập', phone: '', hours: '07:00 – 23:00', priceRange: '1.000 – 100.000 ₫', status: 'pending', verifiedBy: '', description: 'Không gian cà phê phong cách nhà kho, phù hợp học tập và làm việc.' },
    { id: 'B026', name: 'Mộc Miên Cafe', address: '12 P. Huế, Hà Nội', type: 'Quán cà phê', phone: '0988 111 026', hours: '07:00 – 22:30', priceRange: '40.000 – 90.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Quán cà phê yên tĩnh với hai khu vực phục vụ.' },
    { id: 'B027', name: 'Jump Arena', address: 'Tầng 3, Aeon Mall Hà Đông', type: 'Giải trí', phone: '0988 111 027', hours: '09:00 – 22:00', priceRange: '150.000 – 250.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Khu vui chơi vận động trong nhà dành cho nhiều độ tuổi.' },
    { id: 'B028', name: 'Nắng Studio', address: '25 Ng. Thái Hà, Hà Nội', type: 'Làm đẹp', phone: '0988 111 028', hours: '09:00 – 21:00', priceRange: '300.000 ₫', status: 'pending', verifiedBy: '', description: 'Studio làm đẹp và chụp ảnh cá nhân.' },
    { id: 'B029', name: 'The Reading Room', address: '88 P. Trần Hưng Đạo, Hà Nội', type: 'Không gian đọc', phone: '0988 111 029', hours: '08:00 – 22:00', priceRange: '50.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Không gian đọc sách và làm việc yên tĩnh.' },
    { id: 'B030', name: 'Sân cầu lông Đông Đô', address: '40 P. Lê Trọng Tấn, Hà Nội', type: 'Thể thao', phone: '0988 111 030', hours: '06:00 – 22:00', priceRange: '120.000 ₫/giờ', status: 'pending', verifiedBy: '', description: 'Cụm sân cầu lông cho thuê theo giờ với bốn sân tiêu chuẩn.' },
    { id: 'B031', name: 'Luna Workshop', address: '16 P. Tạ Quang Bửu, Hà Nội', type: 'Workshop', phone: '0988 111 031', hours: '09:00 – 20:00', priceRange: '190.000 ₫', status: 'active', verifiedBy: 'Admin Nhân', description: 'Không gian workshop thủ công và lớp học sáng tạo cuối tuần.' }
  ];

  const activities = [
    { id: 'A001', name: 'Whimsical Crown', businessId: 'B001', type: 'beauty', category: 'Làm đẹp', price: '200.000 ₫', hours: '14:00–20:00', address: 'Xưởng Cafe, Bạch Mai, Hà Nội', location: '20.99614, 105.85003', status: 'active', description: 'Workshop Whimsical Crown — làm vương miện chuẩn vibe Pinterest tại Hà Nội.', verifiedBy: '', expireAt: '', views: 312, participants: 18, rating: 4.7, createdAt: '01/09/2026', icon: '🎨' },
    { id: 'A002', name: 'Tập Gym & Fitness', businessId: 'B002', type: 'entertainment', category: 'Thể thao', price: '150.000 ₫', hours: '06:00–21:30', address: '81B Bùi Thị Xuân, Hà Nội', location: '21.0181, 105.8491', status: 'active', description: 'Buổi tập gym có huấn luyện viên hướng dẫn cho người mới.', verifiedBy: 'Admin Nhân', expireAt: '', views: 245, participants: 32, rating: 4.5, createdAt: '30/08/2026', icon: '🏋️' },
    { id: 'A004', name: 'Esports Arena (Giải Phóng)', businessId: 'B004', type: 'entertainment', category: 'Giải trí', price: '100.000 ₫', hours: 'Cả ngày', address: '697 Đ. Giải Phóng, Tương Mai, Hà Nội', location: '20.9857, 105.8421', status: 'active', description: 'Không gian thi đấu và trải nghiệm esports tại chi nhánh Giải Phóng.', verifiedBy: 'Admin Nhân', expireAt: '', views: 520, participants: 61, rating: 4.8, createdAt: '28/08/2026', icon: '🎮' },
    { id: 'A005', name: 'Esports Arena (Cầu Giấy)', businessId: 'B004', type: 'entertainment', category: 'Giải trí', price: '100.000 ₫', hours: 'Cả ngày', address: '20 Ng.165 Đ. Cầu Giấy, Hà Nội', location: '21.0352, 105.7944', status: 'active', description: 'Không gian esports mở cửa cả ngày tại chi nhánh Cầu Giấy.', verifiedBy: 'Admin Nhân', expireAt: '', views: 410, participants: 49, rating: 4.6, createdAt: '27/08/2026', icon: '🎮' },
    { id: 'A006', name: 'Esports Arena (Hoàng Hoa Thám)', businessId: 'B004', type: 'entertainment', category: 'Giải trí', price: '100.000 ₫', hours: 'Cả ngày', address: '713 Đ. Hoàng Hoa Thám, Hà Nội', location: '21.0475, 105.8054', status: 'active', description: 'Không gian esports mở cửa cả ngày tại chi nhánh Hoàng Hoa Thám.', verifiedBy: 'Admin Nhân', expireAt: '', views: 389, participants: 45, rating: 4.6, createdAt: '26/08/2026', icon: '🎮' },
    { id: 'A011', name: 'Muzic Box', businessName: 'Muzic Box', type: 'entertainment', category: 'Giải trí', price: '50.000–100.000 ₫', hours: '10:00–00:00', address: 'Hà Nội', location: '', status: 'active', description: 'Không gian âm nhạc và giải trí cho nhóm bạn.', verifiedBy: '', expireAt: '', views: 205, participants: 22, rating: 4.3, createdAt: '24/08/2026', icon: '🎵' },
    { id: 'A013', name: 'Bi-a Batuna Billiards', businessId: 'B010', type: 'entertainment', category: 'Giải trí', price: '100.000 ₫', hours: 'Cả ngày', address: '72 Trần Đại Nghĩa, Hà Nội', location: '21.0032, 105.8470', status: 'active', description: 'Trải nghiệm billiards trong không gian hiện đại.', verifiedBy: 'Admin Nhân', expireAt: '', views: 278, participants: 35, rating: 4.5, createdAt: '22/08/2026', icon: '🎱' },
    { id: 'A018', name: 'Rạp Beta Giải Phóng', businessId: 'B015', type: 'entertainment', category: 'Xem phim', price: '60.000 ₫', hours: 'Cả ngày', address: '360 Đ. Giải Phóng, Hà Nội', location: '21.0021, 105.8412', status: 'pending', description: 'Suất chiếu phim thường tại rạp Beta Giải Phóng.', verifiedBy: '', expireAt: '', views: 0, participants: 0, rating: 0, createdAt: '20/09/2026', icon: '🎬' },
    { id: 'A020', name: 'HaPam Nails House', businessId: 'B017', type: 'beauty', category: 'Làm đẹp', price: '120.000 ₫', hours: '09:00–22:00', address: '18 Ng.41 P.Đông Tác, Hà Nội', location: '', status: 'active', description: 'Dịch vụ chăm sóc móng cơ bản trong không gian thư giãn.', verifiedBy: 'Admin Nhân', expireAt: '', views: 168, participants: 20, rating: 4.4, createdAt: '18/08/2026', icon: '💅' },
    { id: 'A024', name: 'Thổ thì thầm Pottery workshop', businessId: 'B021', type: 'workshop', category: 'Workshop', price: '200.000–300.000 ₫', hours: '14:00–20:00', address: '435a Đ. Giải Phóng, Hà Nội', location: '20.9987, 105.8390', status: 'pending', description: 'Workshop làm gốm thủ công từ cơ bản đến hoàn thiện sản phẩm.', verifiedBy: '', expireAt: '', views: 0, participants: 0, rating: 0, createdAt: '19/09/2026', icon: '🏺' },
    { id: 'A025', name: 'Cà Phê Nhà Kho Đại La', businessId: 'B025', type: 'food', category: 'Ăn uống', price: '1.000–100.000 ₫', hours: '07:00–23:00', address: 'Ngách 51 Ng.128C, Bạch Mai', location: '20.9975, 105.8465', status: 'pending', description: 'Không gian cà phê phong cách nhà kho, phù hợp học tập và gặp gỡ.', verifiedBy: '', expireAt: '', views: 0, participants: 0, rating: 0, createdAt: '18/09/2026', icon: '☕' },
    { id: 'A026', name: 'Bếp Nhà Mình', businessName: 'Bếp Nhà Mình', type: 'food', category: 'Ăn uống', price: '80.000 ₫', hours: '10:00–22:00', address: 'Hà Nội', location: '', status: 'active', description: 'Bữa ăn gia đình trong không gian ấm cúng.', verifiedBy: '', expireAt: '', views: 142, participants: 16, rating: 4.2, createdAt: '16/08/2026', icon: '🍲' },
    { id: 'A027', name: 'Bowling Royal City', businessName: 'Royal City', type: 'entertainment', category: 'Giải trí', price: '180.000 ₫', hours: '09:00–23:00', address: 'Royal City, Hà Nội', location: '', status: 'active', description: 'Trải nghiệm bowling dành cho nhóm bạn và gia đình.', verifiedBy: '', expireAt: '', views: 330, participants: 42, rating: 4.6, createdAt: '14/08/2026', icon: '🎳' },
    { id: 'A028', name: 'Lớp vẽ màu nước', businessName: 'Art House', type: 'workshop', category: 'Workshop', price: '250.000 ₫', hours: '09:00–17:00', address: 'Hà Nội', location: '', status: 'pending', description: 'Lớp vẽ màu nước cho người mới bắt đầu, đã gồm dụng cụ.', verifiedBy: '', expireAt: '', views: 0, participants: 0, rating: 0, createdAt: '17/09/2026', icon: '🖌️' },
    { id: 'A029', name: 'Chăm sóc da cơ bản', businessName: 'La Belle Spa', type: 'beauty', category: 'Làm đẹp', price: '300.000 ₫', hours: '09:00–21:00', address: 'Hà Nội', location: '', status: 'active', description: 'Liệu trình chăm sóc da cơ bản và tư vấn cá nhân.', verifiedBy: '', expireAt: '', views: 190, participants: 24, rating: 4.5, createdAt: '12/08/2026', icon: '✨' },
    { id: 'A030', name: 'Brunch cuối tuần', businessName: 'The Garden Cafe', type: 'food', category: 'Ăn uống', price: '220.000 ₫', hours: '08:00–14:00', address: 'Hà Nội', location: '', status: 'active', description: 'Thực đơn brunch cuối tuần trong không gian sân vườn.', verifiedBy: '', expireAt: '', views: 234, participants: 29, rating: 4.4, createdAt: '10/08/2026', icon: '🥐' },
    { id: 'A031', name: 'Phòng chiếu riêng', businessName: 'Moon Cinema', type: 'entertainment', category: 'Xem phim', price: '350.000 ₫', hours: '10:00–23:00', address: 'Hà Nội', location: '', status: 'pending', description: 'Phòng chiếu phim riêng dành cho nhóm nhỏ.', verifiedBy: '', expireAt: '', views: 0, participants: 0, rating: 0, createdAt: '16/09/2026', icon: '📽️' },
    { id: 'A032', name: 'Làm nến thơm', businessId: 'B031', type: 'workshop', category: 'Workshop', price: '190.000 ₫', hours: '13:00–19:00', address: '16 P. Tạ Quang Bửu, Hà Nội', location: '', status: 'active', description: 'Workshop tự làm nến thơm và mang sản phẩm về.', verifiedBy: 'Admin Nhân', expireAt: '', views: 201, participants: 25, rating: 4.7, createdAt: '08/08/2026', icon: '🕯️' },
    { id: 'A033', name: 'Gội đầu thư giãn', businessName: 'May Beauty', type: 'beauty', category: 'Làm đẹp', price: '100.000 ₫', hours: '08:00–20:00', address: 'Hà Nội', location: '', status: 'active', description: 'Dịch vụ gội đầu thư giãn và massage nhẹ.', verifiedBy: '', expireAt: '', views: 175, participants: 19, rating: 4.3, createdAt: '06/08/2026', icon: '💆' }
  ];

  const participations = [
    { customerId: 'C001', activityId: 'A001', date: '07/09/2026', status: 'joined', rating: 5 },
    { customerId: 'C001', activityId: 'A002', date: '05/09/2026', status: 'joined', rating: 4 },
    { customerId: 'C001', activityId: 'A013', date: '02/09/2026', status: 'joined', rating: 5 },
    { customerId: 'C001', activityId: 'A011', date: '28/08/2026', status: 'cancelled', rating: 0 },
    { customerId: 'C002', activityId: 'A001', date: '05/09/2026', status: 'joined', rating: 4 },
    { customerId: 'C003', activityId: 'A002', date: '06/09/2026', status: 'joined', rating: 5 },
    { customerId: 'C005', activityId: 'A004', date: '04/09/2026', status: 'joined', rating: 5 },
    { customerId: 'C006', activityId: 'A001', date: '02/09/2026', status: 'registered', rating: 0 },
    { customerId: 'C008', activityId: 'A030', date: '30/08/2026', status: 'joined', rating: 4 },
    { customerId: 'C009', activityId: 'A027', date: '28/08/2026', status: 'joined', rating: 5 },
    { customerId: 'C012', activityId: 'A029', date: '24/08/2026', status: 'joined', rating: 5 },
    { customerId: 'C015', activityId: 'A020', date: '20/08/2026', status: 'joined', rating: 4 },
    { customerId: 'C017', activityId: 'A032', date: '18/08/2026', status: 'joined', rating: 5 },
    { customerId: 'C020', activityId: 'A013', date: '15/08/2026', status: 'joined', rating: 4 }
  ];

  const statusLabels = {
    active: 'Hoạt động',
    pending: 'Chờ duyệt',
    locked: 'Đã khóa',
    hidden: 'Đã ẩn',
    rejected: 'Từ chối',
    expired: 'Hết hạn',
    joined: 'Đã tham gia',
    registered: 'Đã đăng ký',
    cancelled: 'Đã hủy'
  };

  function readStatuses() {
    try {
      return JSON.parse(
        localStorage.getItem('free2do-admin-statuses')
      ) || {};
    } catch (error) {
      return {};
    }
  }

  function withStoredStatus(items, entity) {
    const statuses = readStatuses();

    return items.map(item => ({
      ...item,
      status: statuses[`${entity}:${item.id}`] || item.status
    }));
  }

  function setStatus(entity, id, status) {
    try {
      const statuses = readStatuses();

      statuses[`${entity}:${id}`] = status;

      localStorage.setItem(
        'free2do-admin-statuses',
        JSON.stringify(statuses)
      );
    } catch (error) {
      console.warn(
        'Không thể lưu trạng thái vào localStorage.',
        error
      );
    }
  }

  function parseViDate(value) {
    const [day, month, year] = value
      .split('/')
      .map(Number);

    return new Date(year, month - 1, day);
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(
      /[&<>'"]/g,
      character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[character]
    );
  }

  function businessName(activity) {
    const business = businesses.find(
      item => item.id === activity.businessId
    );

    return business
      ? business.name
      : activity.businessName || 'Chưa xác định';
  }

  window.AdminData = {
    get customers() {
      return withStoredStatus(customers, 'customer');
    },

    get businesses() {
      return withStoredStatus(businesses, 'business');
    },

    get activities() {
      return withStoredStatus(activities, 'activity');
    },

    participations: [...participations],
    statusLabels,
    setStatus,
    parseViDate,
    normalize,
    escapeHTML,
    businessName
  };
})();
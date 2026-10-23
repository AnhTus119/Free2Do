-- Đổi tên hoạt động theo định dạng: [Tên Thương Hiệu] - [Loại Hình/Dịch Vụ] (- cs[STT]).
-- Chạy 1 lần trong Supabase SQL Editor. Chạy lại nhiều lần vẫn an toàn.

BEGIN;

UPDATE activities SET name = 'She.slays - Whimsical Crown' WHERE activity_id = 'A001';
UPDATE activities SET name = 'Fitness - Tập Gym & Fitness' WHERE activity_id = 'A002';
UPDATE activities SET name = 'Playik Music Box Bạch Mai - Music Box' WHERE activity_id = 'A003';
UPDATE activities SET name = 'Vikings Cyber - Esports Arena - cs1' WHERE activity_id = 'A004';
UPDATE activities SET name = 'Vikings Cyber - Esports Arena - cs2' WHERE activity_id = 'A005';
UPDATE activities SET name = 'Vikings Cyber - Esports Arena - cs3' WHERE activity_id = 'A006';
UPDATE activities SET name = 'OMNY HAI BÀ TRƯNG - Thanh Lý Ký Gửi - Mua sắm' WHERE activity_id = 'A007';
UPDATE activities SET name = 'Tiny Connection - Ăn uống' WHERE activity_id = 'A009';
UPDATE activities SET name = 'Cybergame BKX - Cybergame BKX' WHERE activity_id = 'A010';
UPDATE activities SET name = 'Muzic Box - Music Box' WHERE activity_id = 'A011';
UPDATE activities SET name = 'Lane 8 Coffee - Ăn uống' WHERE activity_id = 'A012';
UPDATE activities SET name = 'Bi-a Batuna Billiards - Biliard' WHERE activity_id = 'A013';
UPDATE activities SET name = 'Ultra Billiards Club - Biliard' WHERE activity_id = 'A014';
UPDATE activities SET name = 'KATINAT Lê Thanh Nghị - Ăn uống' WHERE activity_id = 'A015';
UPDATE activities SET name = 'Bi A B-Rex 67 Lê Thanh Nghị - Biliard' WHERE activity_id = 'A016';
UPDATE activities SET name = 'Bi A Phú Kỳ - Passion Billiards club - Biliard' WHERE activity_id = 'A017';
UPDATE activities SET name = 'Rạp Beta Giải Phóng - Xem phim' WHERE activity_id = 'A018';
UPDATE activities SET name = 'Bảo tàng Phòng không - Không quân - Tham quan' WHERE activity_id = 'A019';
UPDATE activities SET name = 'HaPam Nails House - Làm đẹp' WHERE activity_id = 'A020';
UPDATE activities SET name = 'HUN Thanh lý ký gửi - Mua sắm' WHERE activity_id = 'A021';
UPDATE activities SET name = 'Cami Camera - Tiệm cho thuê máy ảnh' WHERE activity_id = 'A022';
UPDATE activities SET name = 'Onemore Workspace - Làm việc' WHERE activity_id = 'A023';
UPDATE activities SET name = 'Thổ thì thầm Pottery workshop - workshop' WHERE activity_id = 'A024';
UPDATE activities SET name = 'Cà Phê Nhà Kho Đại La - Ăn uống' WHERE activity_id = 'A025';
UPDATE activities SET name = 'Tiệm mì Biển Cam - Ăn uống' WHERE activity_id = 'A026';
UPDATE activities SET name = 'Chạm Mây Boardgame & Cafe - Quán cà phê' WHERE activity_id = 'A027';
UPDATE activities SET name = 'Lắp Ghép Coffee & Charm - Quán cà phê' WHERE activity_id = 'A028';
UPDATE activities SET name = 'Trại Trà - Quán cà phê' WHERE activity_id = 'A029';
UPDATE activities SET name = 'Canopy StudySpace - Quán cà phê' WHERE activity_id = 'A030';
UPDATE activities SET name = 'Photo Easel - Chụp ảnh' WHERE activity_id = 'A031';

-- Xóa hoạt động test tên "123" (và dữ liệu liên quan).
CREATE TEMP TABLE _del_act AS SELECT activity_id FROM activities WHERE name = '123';
DELETE FROM review_media WHERE review_id IN (SELECT review_id FROM reviews WHERE activity_id IN (SELECT activity_id FROM _del_act));
DELETE FROM complaints WHERE review_id IN (SELECT review_id FROM reviews WHERE activity_id IN (SELECT activity_id FROM _del_act));
DELETE FROM review_reply_media WHERE reply_id IN (SELECT reply_id FROM review_replies WHERE review_id IN (SELECT review_id FROM reviews WHERE activity_id IN (SELECT activity_id FROM _del_act)));
DELETE FROM review_replies WHERE review_id IN (SELECT review_id FROM reviews WHERE activity_id IN (SELECT activity_id FROM _del_act));
DELETE FROM reviews WHERE activity_id IN (SELECT activity_id FROM _del_act);
DELETE FROM reports WHERE activity_id IN (SELECT activity_id FROM _del_act);
DELETE FROM bookmarks WHERE activity_id IN (SELECT activity_id FROM _del_act);
DELETE FROM activities_media WHERE activity_id IN (SELECT activity_id FROM _del_act);
DELETE FROM activities_categories WHERE activity_id IN (SELECT activity_id FROM _del_act);
UPDATE groups SET selected_activity_id = NULL WHERE selected_activity_id IN (SELECT activity_id FROM _del_act);
DELETE FROM activities WHERE activity_id IN (SELECT activity_id FROM _del_act);
DROP TABLE _del_act;

COMMIT;

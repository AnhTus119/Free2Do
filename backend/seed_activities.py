"""Nạp dữ liệu hoạt động từ sheet ``DỮ LIỆU`` của QUẢN LÝ DỰ ÁN CNTT.xlsx.

Chạy sau ``python init_db.py`` và migration.sql:
    python seed_activities.py

Script có thể chạy lại an toàn: doanh nghiệp/hoạt động được cập nhật theo mã nguồn.
"""

import re
from datetime import UTC, datetime, time

from app import models
from app.auth import hash_password
from app.database import SessionLocal
from app.utils.identity import normalize_phone


ACTIVITIES = [
    ("A001", "B001", "She.slays", "0934802345", "Whimsical Crown", "Workshop Whimsical Crown - làm vương niệm chuẩn vibe Pinterest tại Hà Nội", 200000, "200000", "Xưởng Cafe, Bạch Mai, Hà Nội", 20.99614, 105.85003, "14:00", "20:00", "Workshop", None),
    ("A002", "B002", "Fitness", "0934572345", "Tập Gym & Fitness", "Hoạt động tập luyện thể thao tại phòng gym", 150000, "150000", "81B Bùi Thị Xuân, Hai Bà Trưng, Hà Nội", 20.99955, 105.84836, "06:00", "21:30", "Thể thao", None),
    ("A003", "B003", "Playik Music Box Bạch Mai", "0868844315", "Music Box", "Giải Trí", 100000, "100000", "315 P. Bạch Mai, Bạch Mai, Hà Nội, Việt Nam", 20.99796, 105.84987, "10:00", "01:30", "Giải trí", None),
    ("A004", "B004", "Vikings Cyber", "0793002247", "Esports Arena", "Quán net", 100000, "100000", "697 Đ. Giải Phóng, Tương Mai, Hà Nội 100000, Việt Nam", 20.9884873, 105.8413661, "cả ngày", None, "Giải trí", None),
    ("A005", "B004", "Vikings Cyber", "0793002247", "Esports Arena", "Quán net", 100000, "100000", "20 Ng. 165 Đ. Cầu Giấy, Cầu Giấy, Hà Nội 100000, Việt Nam", 21.03387, 105.7944, "cả ngày", None, "Giải trí", None),
    ("A006", "B004", "Vikings Cyber", "0793002248", "Esports Arena", "Quán net", 100000, "100000", "713 Đ. Hoàng Hoa Thám, Ngọc Hà, Hà Nội 100000, Việt Nam", 21.047383, 105.807173, "cả ngày", None, "Giải trí", None),
    ("A007", "B005", "OMNY HAI BÀ TRƯNG - Thanh Lý Ký Gửi", "0934802000", "Mua sắm", None, 50000, "50000", "413 P. Kim Ngưu, Vĩnh Tuy, Hà Nội 100000, Việt Nam", 21.00023, 105.85441, "10:00", "20:00", "Mua sắm", "https://sites.google.com/view/omnyvn/d%E1%BB%8Bch-v%E1%BB%A5?authuser=0"),
    ("A009", "B006", "Tiny Connection", "0832824079", "Ăn uống", None, 100000, "1-100.000 ₫", "42 Ng. 120 Đ. Trường Chinh, Kim Liên, Hà Nội 10000, Việt Nam", None, None, "07:30", "01:30", "Ăn uống", None),
    ("A010", "B007", "Cybergame BKX", "0832824179", "Cybergame BKX", "Quán net", 100000, "100000", "10 Ng. 231 P. Trần Đại Nghĩa, Bạch Mai, Hà Nội, Việt Nam", 21.00032, 105.844515, "cả ngày", None, "Giải trí", None),
    ("A011", "B008", "Muzic Box", "0987374989", "Music Box", "Music Box/Karaoke Box", 100000, "50.000–100.000đ", "8 Ngõ 96 Ngõ Tự Do, Trương Định, Hai Bà Trưng, Hà Nội", 20.997, 105.846, "10:00", "00:00", "Giải trí", None),
    ("A012", "B009", "Lane 8 Coffee", "0911011900", "Ăn uống", "Quán cà phê", 100000, "1-100.000 ₫", "14 Ng. 57 P. Phương Liệt, Phương Liệt, Hà Nội, Việt Nam", None, None, "08:30", "20:30", "Ăn uống", "https://www.facebook.com/profile.php?id=61557429491895&mibextid=JRoKGi"),
    ("A013", "B010", "Bi-a Batuna Billiards", "0981944331", "Biliard", "Giải Trí", 100000, "100000", "72 Trần Đại Nghĩa, Bạch Mai, Hà Nội 100000, Việt Nam", 21.0070417, 105.8448791, "cả ngày", None, "Giải trí", "https://maps.app.goo.gl/KvAHhka7TsFokNxj6"),
    ("A014", "B011", "Ultra Billiards Club", "0866852099", "Biliard", "Giải Trí", 100000, "100000", "140 Trần Đại Nghĩa, Tương Mai, Hà Nội 100000, Việt Nam", 20.9955328, 105.8449465, "cả ngày", None, "Giải trí", None),
    ("A015", "B012", "KATINAT Lê Thanh Nghị", "02473001024", "Ăn uống", "Quán cà phê", 100000, "1-100.000 ₫", "67 P. Lê Thanh Nghị, Bạch Mai, Hà Nội, Việt Nam", None, None, "07:00", "22:30", "Ăn uống", "https://katinat.vn/"),
    ("A016", "B013", "Bi A B-Rex 67 Lê Thanh Nghị", "0368021302", "Biliard", "Giải Trí", 100000, "100000", "67 P. Lê Thanh Nghị, Bạch Mai, Hà Nội, Việt Nam", 21.0013862, 105.8446191, "cả ngày", None, "Giải trí", "https://maps.app.goo.gl/eWmQTxkN4CPdyxNq7"),
    ("A017", "B014", "Bi A Phú Kỳ - Passion Billiards club", "0889676869", "Biliard", "Giải Trí", 100000, "100000", "Số 10 P. Tạ Quang Bửu, Bạch Mai, Hà Nội, Việt Nam", 21.0011192, 105.8495458, "cả ngày", None, "Giải trí", "https://maps.app.goo.gl/PvEMhjNh3N3M9Sce8"),
    ("A018", "B015", "Rạp Beta Giải Phóng", "0585680360", "Xem phim", "Giải Trí", 60000, "60000", "IP2 toà Imperial, 360 Đ. Giải Phóng, Phương Liệt, Hà Nội, Việt Nam", None, None, "cả ngày", None, "Giải trí", None),
    ("A019", "B016", "Bảo tàng Phòng không - Không quân", "069562322", "Tham quan", None, 20000, "20000", "173C Đ. Trường Chinh, Phương Liệt, Hà Nội, Việt Nam", None, None, "8:00-11:00", "13:00-16:00", "Tham quan", "https://vi.wikipedia.org/wiki/B%E1%BA%A3o_t%C3%A0ng_Ph%C3%B2ng_kh%C3%B4ng_-_Kh%C3%B4ng_qu%C3%A2n_(Vi%E1%BB%87t_Nam)"),
    ("A020", "B017", "HaPam Nails House", "0398556604", "Làm đẹp", "Làm nail phong cách trẻ trung", 120000, "120000", "18 Ng. 41 P. Đông Tác, Đông Tác, Kim Liên, Hà Nội 11520, Việt Nam", None, None, "09:00", "22:00", "Làm đẹp", None),
    ("A021", "B018", "HUN Thanh lý ký gửi", "0923002177", "Mua sắm", None, 100000, "100000", "Ng. 109 Đ. Trường Chinh, Phương Liệt, Hà Nội, Việt Nam", None, None, "09:00", "21:00", "Mua sắm", "https://hunthanhlykygui.com/"),
    ("A022", "B019", "Cami Camera", "0984422900", "Tiệm cho thuê máy ảnh", "Tiệm cho thuê máy ảnh Cami Camera", 200000, "200000", "C69 Ng. 109 Đ. Trường Chinh, Phương Liệt, Hà Nội 10000, Việt Nam", None, None, "07:00", "23:30", "Chụp ảnh", "https://www.instagram.com/cami_cameraa?igsh=dGJtMGtrNm41bGJw"),
    ("A023", "B020", "Onemore Workspace", "0969608093", "Làm việc", "Phù hợp cho những người cần sự yên tĩnh", 50000, "50000", "134 Ng. Tự Do, Bạch Mai, Hà Nội, Việt Nam", None, None, "07:30", "01:30", "Làm việc", "https://www.facebook.com/onemoreworkspace"),
    ("A024", "B021", "Thổ thì thầm Pottery workshop", "0396599572", "Workshop", "Quán cà phê nghệ thuật", 300000, "200000-300000", "TT 435a Đ. Giải Phóng, Tương Mai, Hà Nội, Việt Nam", None, None, "14:00", "20:00", "Workshop", "https://www.instagram.com/tho_thitham?igsh=Mnl6ZjVydGk2MHV2"),
    ("A025", "B022", "Cà Phê Nhà Kho Đại La", None, "Ăn uống", "Quán cà phê học tập", 100000, "1-100.000 ₫", "Ngách 51 Ng. 128C P. Đại La, Bạch Mai, Hà Nội, Việt Nam", None, None, "07:00", "23:00", "Ăn uống", None),
    ("A026", "B023", "Tiệm mì Biển Cam", "0917348688", "Ăn uống", "Nhà hàng", 100000, "1-100.000 ₫", "80 Ng. Tự Do, Bạch Mai, Hà Nội, Việt Nam", None, None, "10:30", "23:00", "Ăn uống", None),
    ("A027", "B024", "Chạm Mây Boardgame & Cafe", "0927802859", "Quán cà phê", "Câu lạc bộ trò chơi cờ bàn", 100000, "1-100.000 ₫", "3 Ngõ 383 Trần Đại Nghĩa, Tương Mai, Hà Nội, Việt Nam", None, None, "13:00", "02:00", "Giải trí", "http://byvn.net/ChamMay"),
    ("A028", "B025", "Lắp Ghép Coffee & Charm", "0862247487", "Quán cà phê", "Quán cà phê nghệ thuật", 100000, "1-100.000 ₫", "Số 1B, Dãy Q21, Ng. 134 Đ. Nguyễn An Ninh, Tương Mai, Hà Nội, Việt Nam", None, None, "09:00", "23:00", "Ăn uống", "https://www.facebook.com/profile.php?id=61550770513466&mibextid=LQQJ4d"),
    ("A029", "B026", "Trại Trà", "0386969375", "Quán cà phê", "Quán cà phê", 100000, "1-100.000 ₫", "34 Ng. 255 P. Vọng, Tương Mai, Hà Nội, Việt Nam", None, None, "08:30", "23:00", "Ăn uống", "https://traitra.vn/"),
    ("A030", "B027", "Canopy StudySpace", "0961824089", "Quán cà phê", "Quán cà phê", 100000, "1-100.000 ₫", "89 ngõ 183 Trần Đại Nghĩa, Bạch Mai, Hà Nội, Việt Nam", None, None, "cả ngày", None, "Làm việc", "http://www.tiktok.com/@canopy.studyspace"),
    ("A031", "B028", "Photo Easel", "0987487774", "Chụp ảnh", "PhotoBooth Tạ Quang Bửu", 100000, "70.000-100.000", "103e7 P. Tạ Quang Bửu, Khu tập thể Bách Khoa, Bạch Mai, Hà Nội, Việt Nam", None, None, "09:00", "23:00", "Chụp ảnh", None),
]

# Cột ``LINK Googlemap`` trong sheet DỮ LIỆU, ghép bằng activity_id.
# Tách khỏi source_url vì source_url là website/Facebook/TikTok cung cấp thông tin.
GOOGLE_MAP_URLS = {
    "A001": "https://maps.app.goo.gl/MbNc5WPasWq1Ad9u5?g_st=ic",
    "A002": "https://maps.app.goo.gl/MCZEsJ4oMRNCMCDLA?g_st=ic",
    "A003": "https://maps.app.goo.gl/F3zmREZe98Z5T5hF6?g_st=ic",
    "A004": "https://maps.app.goo.gl/5C8VdVNUSgtkchqHA?g_st=ic",
    "A005": "https://maps.app.goo.gl/4wNnXYEHDWZXZUUE8?g_st=ic",
    "A006": "https://maps.app.goo.gl/CoHdPmrT7fMf1njh8?g_st=ic",
    "A007": "https://maps.app.goo.gl/k6ypyEkDkJAXYYxs5?g_st=ic",
    "A009": "https://maps.app.goo.gl/NP6wua1gAFuzf4gs6?g_st=ic",
    "A010": "https://maps.app.goo.gl/ry1UVQ2GaxPMUVPh6?g_st=ic",
    "A011": "https://maps.app.goo.gl/RegguYApzXYYrvM16?g_st=ic",
    "A012": "https://maps.app.goo.gl/2MwoqG3DQ4dCjBiz9?g_st=ic",
    "A013": "https://maps.app.goo.gl/eWMK81PryW4wcjZP6?g_st=ic",
    "A014": "https://maps.app.goo.gl/vZ27VzKopsSWVAXc9?g_st=ic",
    "A015": "https://maps.app.goo.gl/kHcWKM5NMCDVsgZA7?g_st=ic",
    "A016": "https://maps.app.goo.gl/kHcWKM5NMCDVsgZA7?g_st=ic",
    "A017": "https://maps.app.goo.gl/LmDAXK6uj9p33Hby9?g_st=ic",
    "A018": "https://maps.app.goo.gl/YZwzECAFK1TWVA6N9?g_st=ic",
    "A019": "https://maps.app.goo.gl/KkdTKMGpCgDinPAD9?g_st=ic",
    "A020": "https://maps.app.goo.gl/KWz42uBJCvr722iZ7?g_st=ic",
    "A021": "https://maps.app.goo.gl/E4CfEbZ54BNkK4BJA?g_st=ic",
    "A022": "https://maps.app.goo.gl/zQVmmvgTmysAFV4T8?g_st=ic",
    "A023": "https://maps.app.goo.gl/SoZqMM7BogRLiu7h8?g_st=ic",
    "A024": "https://maps.app.goo.gl/gsz1AWKrSkwo956h9?g_st=ic",
    "A025": "https://maps.app.goo.gl/m72XQvq845g2KQNb6?g_st=ic",
    "A026": "https://maps.app.goo.gl/9SDM5FuULQGWhfMj8?g_st=ic",
    "A027": "https://maps.app.goo.gl/Xu4nXojThbFFeH4J6?g_st=ic",
    "A028": "https://maps.app.goo.gl/SF1ugaLckSycaJR56?g_st=ic",
    "A029": "https://maps.app.goo.gl/k4Tf26NSpzrXySLK7?g_st=ic",
    "A030": "https://maps.app.goo.gl/sKfgFXWmWBgA8n8r5?g_st=ic",
    "A031": "https://maps.app.goo.gl/ptaDBG6wUeUEUrSC9?g_st=ic",
}


def _as_datetime(value, closing=False):
    if not value:
        return None
    if value == "cả ngày":
        parsed = time(23, 59) if closing else time(0, 0)
    else:
        matches = re.findall(r"(\d{1,2}):(\d{2})", value)
        if not matches:
            return None
        hour, minute = matches[-1] if closing else matches[0]
        parsed = time(int(hour) % 24, int(minute))
    return datetime.combine(datetime(2000, 1, 1).date(), parsed)


def main():
    db = SessionLocal()
    try:
        now = datetime.now(UTC).replace(tzinfo=None)
        business_role = db.query(models.Role).filter(models.Role.role_name == "business").first()
        if business_role is None:
            business_role = models.Role(role_name="business")
            db.add(business_role)
            db.flush()

        categories = {}
        for name in sorted({row[13] for row in ACTIVITIES}):
            category = db.query(models.Category).filter(models.Category.name == name).first()
            if category is None:
                category = models.Category(name=name)
                db.add(category)
                db.flush()
            categories[name] = category

        businesses = {}
        for row in ACTIVITIES:
            _, business_id, business_name, phone, _, _, _, _, address, *_ = row
            businesses.setdefault(business_id, (business_name.strip(), phone, address))

        for business_id, (name, phone, address) in businesses.items():
            user = db.query(models.User).filter(models.User.user_id == business_id).first()
            if user is None:
                login_phone = normalize_phone(phone) if phone else None
                account = models.Account(
                    account_id=f"ACC-{business_id}",
                    email=f"{business_id.lower()}@seed.free2do.local",
                    phone=login_phone,
                    password_hash=hash_password("Doanhnghiep123") if login_phone else None,
                    auth_provider="phone" if login_phone else "seed",
                    email_verified=True,
                    account_type="user",
                    status="active",
                    created_at=now,
                )
                db.add(account)
                user = models.User(
                    user_id=business_id,
                    account_id=account.account_id,
                    role_id=business_role.role_id,
                    name=name,
                    phone=phone,
                )
                db.add(user)
                db.flush()
            elif phone and user.account and user.account.auth_provider == "seed":
                login_phone = normalize_phone(phone)
                user.account.phone = login_phone
                user.account.password_hash = hash_password("Doanhnghiep123")
                user.account.auth_provider = "phone"
                user.phone = login_phone
            profile = db.query(models.BusinessProfile).filter(models.BusinessProfile.user_id == business_id).first()
            if profile is None:
                profile = models.BusinessProfile(user_id=business_id, business_name=name, phone=phone, business_address=address)
                db.add(profile)
            else:
                profile.business_name, profile.phone, profile.business_address = name, phone, address

        db.flush()
        for row in ACTIVITIES:
            (activity_id, business_id, _, _, name, description, price, price_text, address,
             latitude, longitude, time_open, time_close, category_name, source_url) = row
            activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
            values = dict(
                business_id=business_id,
                name=name.strip(),
                description=description,
                price=price,
                price_text=price_text,
                address=address,
                latitude=latitude,
                longitude=longitude,
                time_open=_as_datetime(time_open),
                time_close=_as_datetime(time_close or time_open, closing=True),
                status="active",
                source_url=source_url,
                google_maps_url=GOOGLE_MAP_URLS[activity_id],
                updated_at=now,
            )
            if activity is None:
                activity = models.Activity(activity_id=activity_id, created_at=now, **values)
                db.add(activity)
                db.flush()
            else:
                for field, value in values.items():
                    setattr(activity, field, value)
            db.query(models.ActivityCategory).filter(models.ActivityCategory.activity_id == activity_id).delete()
            db.add(models.ActivityCategory(activity_id=activity_id, category_id=categories[category_name].category_id))

        db.commit()
        print(f"Imported {len(businesses)} businesses and {len(ACTIVITIES)} activities from workbook.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

const bcrypt = require('bcryptjs');
const db = require('./database');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('admin','customer')) DEFAULT 'customer',
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      contact TEXT,
      address TEXT,
      birth_date TEXT,
      valid_id_path TEXT,
      license_path TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('Car','Motorcycle')),
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER,
      plate_number TEXT NOT NULL UNIQUE,
      color TEXT,
      transmission TEXT,
      fuel_type TEXT,
      seats INTEGER,
      engine_cc INTEGER,
      helmet_included INTEGER DEFAULT 0,
      daily_rate REAL NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available','Reserved','Rented','Maintenance','Unavailable','Archived')),
      image TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      pickup_time TEXT NOT NULL DEFAULT '09:00',
      return_time TEXT NOT NULL DEFAULT '18:00',
      total_days INTEGER NOT NULL,
      daily_rate REAL NOT NULL,
      total_amount REAL NOT NULL,
      payment_option TEXT NOT NULL CHECK(payment_option IN ('50% Downpayment','Full Payment','Pay at Location')),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('Online Transfer','Pay at Location')),
      payment_status TEXT NOT NULL DEFAULT 'Unpaid' CHECK(payment_status IN ('Unpaid','Pending Verification','Partially Paid','Paid','Rejected','Refund Due','Refunded')),
      booking_status TEXT NOT NULL DEFAULT 'Confirmed' CHECK(booking_status IN ('Confirmed','Ongoing','Completed','Cancelled','Expired')),
      proof_path TEXT,
      payment_reference TEXT,
      amount_paid REAL NOT NULL DEFAULT 0,
      refund_status TEXT DEFAULT 'None',
      cancellation_reason TEXT,
      actual_pickup_at TEXT,
      actual_return_at TEXT,
      late_hours INTEGER NOT NULL DEFAULT 0,
      late_penalty REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'Rental Payment',
      status TEXT NOT NULL DEFAULT 'Pending Verification',
      proof_path TEXT,
      reference_no TEXT,
      verified_by INTEGER,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(booking_id) REFERENCES bookings(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(verified_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS extensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      requested_end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Approved',
      additional_days INTEGER NOT NULL,
      additional_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(booking_id) REFERENCES bookings(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      maintenance_type TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','In Progress','Completed','Cancelled')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(booking_id) REFERENCES bookings(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS damage_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      photo_path TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(booking_id) REFERENCES bookings(id)
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const admin = db.prepare('SELECT id FROM users WHERE email=?').get('admin@riderent.com');
  if (!admin) {
    db.prepare(`INSERT INTO users (role,first_name,last_name,email,password_hash,contact,address,birth_date)
                VALUES ('admin','RideRent','Administrator',?,?,?,?,?)`)
      .run('admin@riderent.com', bcrypt.hashSync('Admin123!', 10), '09XX-XXX-XXXX', 'Buenavista, Bohol', '1990-01-01');
  }

  const demo = db.prepare('SELECT id FROM users WHERE email=?').get('customer@riderent.com');
  if (!demo) {
    db.prepare(`INSERT INTO users (role,first_name,last_name,email,password_hash,contact,address,birth_date,valid_id_path,license_path)
                VALUES ('customer','Demo','Customer',?,?,?,?,?,?,?)`)
      .run('customer@riderent.com', bcrypt.hashSync('Customer123!', 10), '09123456789', 'Buenavista, Bohol', '2000-01-01', '/images/sample-id.svg', '/images/sample-license.svg');
  }

  const vehicleCount = db.prepare('SELECT COUNT(*) AS c FROM vehicles').get().c;
  if (vehicleCount === 0) {
    const vehicles = [
      ['Car','Toyota','Vios',2024,'RR-CAR-001','White','Automatic','Gasoline',5,null,0,1800,'Comfortable sedan for city and provincial trips.','/images/car.svg'],
      ['Car','Honda','City',2023,'RR-CAR-002','Black','Automatic','Gasoline',5,null,0,2000,'Fuel-efficient sedan with a spacious cabin.','/images/car.svg'],
      ['Car','Toyota','Innova',2024,'RR-CAR-003','Silver','Automatic','Diesel',8,null,0,3000,'Family-friendly MPV for group travel.','/images/car.svg'],
      ['Car','Mitsubishi','Xpander',2023,'RR-CAR-004','Gray','Automatic','Gasoline',7,null,0,2900,'Modern MPV with flexible seating.','/images/car.svg'],
      ['Car','Suzuki','Ertiga',2022,'RR-CAR-005','White','Automatic','Gasoline',7,null,0,2600,'Practical and economical seven-seater.','/images/car.svg'],
      ['Car','Toyota','Wigo',2024,'RR-CAR-006','Red','Automatic','Gasoline',5,null,0,1600,'Compact car ideal for daily use.','/images/car.svg'],
      ['Car','Nissan','Almera',2023,'RR-CAR-007','Blue','Automatic','Gasoline',5,null,0,1900,'Comfortable sedan with good fuel economy.','/images/car.svg'],
      ['Car','Ford','Everest',2024,'RR-CAR-008','Black','Automatic','Diesel',7,null,0,4500,'Premium SUV for long-distance travel.','/images/car.svg'],
      ['Car','Toyota','Fortuner',2023,'RR-CAR-009','White','Automatic','Diesel',7,null,0,4300,'Reliable SUV for family and business trips.','/images/car.svg'],
      ['Car','Hyundai','Stargazer',2024,'RR-CAR-010','Gray','Automatic','Gasoline',7,null,0,3200,'Spacious MPV with modern features.','/images/car.svg'],
      ['Motorcycle','Honda','Click 125i',2024,'RR-MOTO-001','Black','Automatic','Gasoline',2,125,1,500,'Easy-to-ride scooter with helmet included.','/images/motorcycle.svg'],
      ['Motorcycle','Yamaha','Mio i125',2023,'RR-MOTO-002','Blue','Automatic','Gasoline',2,125,1,500,'Lightweight scooter for convenient travel.','/images/motorcycle.svg'],
      ['Motorcycle','Honda','ADV 160',2024,'RR-MOTO-003','Red','Automatic','Gasoline',2,160,1,850,'Adventure-style scooter with helmet included.','/images/motorcycle.svg'],
      ['Motorcycle','Yamaha','NMAX 155',2024,'RR-MOTO-004','Gray','Automatic','Gasoline',2,155,1,900,'Comfortable maxi-scooter for longer rides.','/images/motorcycle.svg'],
      ['Motorcycle','Honda','PCX 160',2023,'RR-MOTO-005','White','Automatic','Gasoline',2,160,1,900,'Premium scooter with smooth ride.','/images/motorcycle.svg'],
      ['Motorcycle','Suzuki','Burgman Street',2023,'RR-MOTO-006','Black','Automatic','Gasoline',2,125,1,600,'Practical scooter with generous storage.','/images/motorcycle.svg'],
      ['Motorcycle','Yamaha','Aerox 155',2024,'RR-MOTO-007','Blue','Automatic','Gasoline',2,155,1,850,'Sporty scooter with strong performance.','/images/motorcycle.svg'],
      ['Motorcycle','Honda','Beat',2023,'RR-MOTO-008','Red','Automatic','Gasoline',2,110,1,450,'Economical scooter for short trips.','/images/motorcycle.svg'],
      ['Motorcycle','Honda','TMX 125',2022,'RR-MOTO-009','Black','Manual','Gasoline',2,125,1,450,'Reliable manual motorcycle for everyday use.','/images/motorcycle.svg'],
      ['Motorcycle','Yamaha','Sniper 155',2024,'RR-MOTO-010','Black','Manual','Gasoline',2,155,1,750,'Sport underbone motorcycle with helmet included.','/images/motorcycle.svg']
    ];
    const insert = db.prepare(`INSERT INTO vehicles
      (type,brand,model,year,plate_number,color,transmission,fuel_type,seats,engine_cc,helmet_included,daily_rate,description,image)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const seed = db.transaction(rows => rows.forEach(v => insert.run(...v)));
    seed(vehicles);
  }
}

module.exports = initDb;

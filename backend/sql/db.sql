-- اختار اسم قاعدة البيانات
CREATE DATABASE IF NOT EXISTS glass_tracking
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE glass_tracking;

-- 1) المستخدمين
CREATE TABLE users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  username       VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('admin', 'manager', 'station_operator', 'delivery', 'quality') NOT NULL,
  is_active      TINYINT(1) DEFAULT 1,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2) مراحل الإنتاج (Cutting / Grinding / Furnace ...)
CREATE TABLE stages (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(50) NOT NULL UNIQUE,   -- مثال: CUTTING
  name      VARCHAR(100) NOT NULL,         -- مثال: Cutting
  sequence  INT NOT NULL                   -- ترتيب المرحلة
);

-- 3) المحطات (CUT-01, GRD-01 ...)
CREATE TABLE stations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(50) NOT NULL UNIQUE, -- مثال: CUT-01
  name        VARCHAR(100) NOT NULL,
  stage_id    INT NOT NULL,
  is_active   TINYINT(1) DEFAULT 1,
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);

-- 4) الأوردارات
CREATE TABLE orders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  order_number   VARCHAR(50) NOT NULL UNIQUE,  -- مثال: 580 أو ORD-1001
  customer_name  VARCHAR(150),
  due_date       DATE,
  status         ENUM('not_started', 'in_production', 'completed', 'delivered', 'cancelled')
                  DEFAULT 'not_started',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at   TIMESTAMP NULL
);

-- 5) خطوط الطلب (Lines من Noria مثل F1, G2...)
CREATE TABLE order_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  line_code     VARCHAR(50) NOT NULL,      -- مثال: F1
  glass_type    VARCHAR(100),
  width_mm      INT,
  height_mm     INT,
  quantity      INT NOT NULL,
  notes         VARCHAR(255),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 6) القطع (حبة بحبة) بدون باركود – نستعمل glass_code
CREATE TABLE glass_pieces (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  glass_code       VARCHAR(100) NOT NULL UNIQUE,  -- مثل 580-F1-1
  order_id         INT NOT NULL,
  order_item_id    INT NULL,
  width_mm         INT,
  height_mm        INT,
  glass_type       VARCHAR(100),
  status           ENUM('waiting', 'in_stage', 'completed', 'broken', 'delivered')
                    DEFAULT 'waiting',
  current_stage_id   INT NULL,
  current_station_id INT NULL,
  is_broken        TINYINT(1) DEFAULT 0,
  broken_reason    VARCHAR(255),
  broken_at        TIMESTAMP NULL,
  delivered_at     TIMESTAMP NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  FOREIGN KEY (current_stage_id) REFERENCES stages(id),
  FOREIGN KEY (current_station_id) REFERENCES stations(id)
);

-- 7) تاريخ السكان (Scan history)
CREATE TABLE piece_scans (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  piece_id    INT NOT NULL,
  station_id  INT NOT NULL,
  stage_id    INT NOT NULL,
  action_type ENUM('enter', 'exit', 'broken') NOT NULL,
  status_after ENUM('waiting','in_stage','completed','broken','delivered') NOT NULL,
  scanned_by  INT NULL,
  scanned_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes       VARCHAR(255),
  FOREIGN KEY (piece_id) REFERENCES glass_pieces(id),
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (stage_id) REFERENCES stages(id),
  FOREIGN KEY (scanned_by) REFERENCES users(id)
);

-- 8) الشحنات (للـ partial delivery)
CREATE TABLE shipments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  shipment_code VARCHAR(50) NOT NULL,
  status        ENUM('pending', 'shipped', 'delivered') DEFAULT 'pending',
  delivered_at  TIMESTAMP NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE shipment_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id  INT NOT NULL,
  piece_id     INT NOT NULL,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id),
  FOREIGN KEY (piece_id) REFERENCES glass_pieces(id)
);

-- 9) الإشعارات
CREATE TABLE notifications (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  type      VARCHAR(100),
  level     ENUM('info','warning','critical') DEFAULT 'info',
  message   VARCHAR(255) NOT NULL,
  order_id  INT NULL,
  piece_id  INT NULL,
  stage_id  INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `read`     TINYINT(1) DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (piece_id) REFERENCES glass_pieces(id),
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);


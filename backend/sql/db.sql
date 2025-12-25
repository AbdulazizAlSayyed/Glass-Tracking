use glass_tracking;
-- ============================================
-- Glass Tracking Database Reset
-- ============================================

-- تعطيل فحص المفاتيح الأجنبية مؤقتاً
SET FOREIGN_KEY_CHECKS = 0;

-- حذف الجداول إذا كانت موجودة
DROP TABLE IF EXISTS order_lines;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users;

-- إعادة تفعيل فحص المفاتيح الأجنبية
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- إنشاء الجداول
-- ============================================

-- 1. جدول المستخدمين
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    station_id INT,
    home_page VARCHAR(80),
    full_name VARCHAR(100),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_role (role),
    INDEX idx_username (username)
);

-- 2. جدول الطلبات
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL UNIQUE,
    client VARCHAR(100) NOT NULL,
    prf VARCHAR(50),
    delivery_date DATE,
    status ENUM('Draft', 'Active', 'Paused', 'Completed', 'Cancelled') DEFAULT 'Draft',
    created_by INT NOT NULL,
    total_lines INT DEFAULT 0,
    total_pieces INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_created_by (created_by),
    INDEX idx_created_at (created_at)
);

-- 3. جدول بنود الطلب
CREATE TABLE order_lines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    line_code VARCHAR(50) NOT NULL,
    qty INT NOT NULL DEFAULT 0,
    size VARCHAR(100),
    glass_type VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_id (order_id),
    INDEX idx_line_code (line_code),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ============================================
-- إضافة البيانات
-- ============================================

-- المستخدمون (كلمات المرور: admin123, amani123, ahmed123, delivery123, ziad123)
-- جميعهم مشفرة بـ bcrypt: $2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6
INSERT INTO users (username, password_hash, role, is_active, station_id, home_page, full_name) VALUES
('admin', '$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6', 'manager', 1, NULL, 'dashboard.html', 'مدير النظام'),
('amani', '$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6', 'order_creator', 1, 2, 'import-orders.html', 'أماني الفارسي'),
('ahmed', '$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6', 'station', 1, 1, 'station.html', 'أحمد حسن'),
('delivery', '$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6', 'station', 1, 6, 'station.html', 'مشغل التوصيل'),
('ziad', '$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6', 'planner', 1, NULL, 'activation.html', 'زياد المنصور');

-- الطلبات
INSERT INTO orders (order_no, client, prf, delivery_date, status, created_by, total_lines, total_pieces) VALUES
('580', 'ALEXCO', '25000641', '2025-12-28', 'Draft', 2, 3, 15),
('581', 'ALEXCO', '25000642', '2025-12-29', 'Draft', 2, 2, 10),
('582', 'BETA Corp', '25000643', '2025-12-30', 'Active', 2, 4, 20),
('583', 'GAMMA Ltd', '25000644', '2025-12-31', 'Completed', 2, 5, 25),
('584', 'DELTA Glass', '25000645', '2026-01-02', 'Draft', 2, 2, 8);

-- بنود الطلبات
INSERT INTO order_lines (order_id, line_code, qty, size, glass_type, notes) VALUES
-- Order 580
(1, '25000641-1', 5, '100x200', 'MAXI', 'زجاج شفاف'),
(1, '25000641-2', 5, '150x200', 'MAXI', NULL),
(1, '25000641-3', 5, '200x300', 'FLOAT', 'مقوى'),
-- Order 581
(2, '25000642-1', 5, '80x120', 'MAXI', 'عاكس للضوء'),
(2, '25000642-2', 5, '90x140', 'FLOAT', NULL),
-- Order 582
(3, '25000643-1', 5, '200x400', 'FLOAT', 'مصفح'),
(3, '25000643-2', 5, '150x250', 'MAXI', 'نهائي مرآة'),
(3, '25000643-3', 5, '180x280', 'FLOAT', 'زجاج أمني'),
(3, '25000643-4', 5, '120x200', 'MAXI', NULL),
-- Order 583
(4, '25000644-1', 5, '100x150', 'MAXI', NULL),
(4, '25000644-2', 5, '120x180', 'FLOAT', 'ملون'),
(4, '25000644-3', 5, '140x200', 'MAXI', NULL),
(4, '25000644-4', 5, '160x220', 'FLOAT', 'منقش'),
(4, '25000644-5', 5, '180x240', 'MAXI', 'مقطع حسب الطلب'),
-- Order 584
(5, '25000645-1', 4, '50x70', 'MAXI', 'للحمام'),
(5, '25000645-2', 4, '60x80', 'FLOAT', 'للمطبخ');

-- ============================================
-- التحقق من البيانات
-- ============================================

SELECT '✅ المستخدمون' AS '';
SELECT id, username, role, home_page, station_id FROM users ORDER BY id;

SELECT '✅ الطلبات' AS '';
SELECT 
    id,
    order_no AS 'رقم الطلب',
    client AS 'العميل',
    status AS 'الحالة',
    total_lines AS 'عدد البنود',
    total_pieces AS 'إجمالي القطع',
    DATE(created_at) AS 'تاريخ الإنشاء'
FROM orders 
ORDER BY created_at DESC;

SELECT '✅ ملخص بنود الطلبات' AS '';
SELECT 
    o.order_no AS 'رقم الطلب',
    o.client AS 'العميل',
    COUNT(ol.id) AS 'عدد البنود',
    SUM(ol.qty) AS 'إجمالي القطع',
    GROUP_CONCAT(DISTINCT ol.glass_type SEPARATOR ', ') AS 'أنواع الزجاج'
FROM orders o
LEFT JOIN order_lines ol ON o.id = ol.order_id
GROUP BY o.id
ORDER BY o.created_at DESC;

SELECT '✅ آخر 5 بنود' AS '';
SELECT 
    o.order_no,
    ol.line_code,
    ol.qty,
    ol.size,
    ol.glass_type,
    ol.notes
FROM order_lines ol
JOIN orders o ON ol.order_id = o.id
ORDER BY ol.created_at DESC
LIMIT 5;
-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: glass_tracking
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `glass_pieces`
--

DROP TABLE IF EXISTS `glass_pieces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `glass_pieces` (
  `id` int NOT NULL AUTO_INCREMENT,
  `piece_code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` int NOT NULL,
  `line_id` int DEFAULT NULL,
  `current_station_id` int DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Waiting',
  `broken_reason` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `broken_notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `piece_code` (`piece_code`),
  KEY `fk_piece_order` (`order_id`),
  KEY `fk_piece_line` (`line_id`),
  KEY `fk_piece_station` (`current_station_id`),
  CONSTRAINT `fk_piece_line` FOREIGN KEY (`line_id`) REFERENCES `order_lines` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_piece_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_piece_station` FOREIGN KEY (`current_station_id`) REFERENCES `stations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `glass_pieces`
--

LOCK TABLES `glass_pieces` WRITE;
/*!40000 ALTER TABLE `glass_pieces` DISABLE KEYS */;
INSERT INTO `glass_pieces` VALUES (1,'715-25000715-1-1',2,2,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(2,'715-25000715-2-1',2,3,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(3,'715-25000715-3-1',2,4,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(4,'715-25000715-4-1',2,5,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(5,'715-25000715-5-1',2,6,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(6,'715-25000715-6-1',2,7,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(7,'715-25000715-7-1',2,8,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(8,'715-25000715-8-1',2,9,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(9,'715-25000715-9-1',2,10,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(10,'715-25000715-10-1',2,11,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(11,'715-25000715-11-1',2,12,1,'Waiting',NULL,NULL,'2025-12-24 13:08:04'),(12,'222-25001454-1-1',3,13,1,'Waiting',NULL,NULL,'2025-12-25 05:42:41'),(13,'13-25000715-1-1',5,15,1,'Waiting',NULL,NULL,'2025-12-25 08:50:29'),(14,'13131-25000715-1-1',6,26,1,'Waiting',NULL,NULL,'2025-12-25 08:51:06'),(15,'13131-25000715-2-1',6,27,1,'Waiting',NULL,NULL,'2025-12-25 08:51:06'),(16,'13131-25000715-3-1',6,28,1,'Waiting',NULL,NULL,'2025-12-25 08:51:06'),(17,'13131-25000715-4-1',6,29,1,'Waiting',NULL,NULL,'2025-12-25 08:51:06'),(18,'13131-25000715-5-1',6,30,1,'Waiting',NULL,NULL,'2025-12-25 08:51:06'),(19,'13131-25000715-8-1',6,33,1,'Waiting',NULL,NULL,'2025-12-25 08:51:06'),(20,'13131-25000715-9-1',6,34,1,'Waiting',NULL,NULL,'2025-12-25 08:51:06'),(21,'13131-25000715-10-1',6,35,1,'Waiting',NULL,NULL,'2025-12-25 08:51:06'),(22,'1520-25001520-1',1,1,1,'Waiting',NULL,NULL,'2025-12-25 08:51:34'),(23,'131-25001551-1-1',4,14,1,'Waiting',NULL,NULL,'2025-12-25 08:51:47'),(24,'13131-25000715-6-1',6,31,1,'Waiting',NULL,NULL,'2025-12-25 08:53:22'),(25,'13131-25000715-7-1',6,32,1,'Waiting',NULL,NULL,'2025-12-25 08:53:22'),(26,'13131-25000715-11-1',6,36,1,'Waiting',NULL,NULL,'2025-12-25 08:53:22');
/*!40000 ALTER TABLE `glass_pieces` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `title` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_notif_user` (`user_id`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_lines`
--

DROP TABLE IF EXISTS `order_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_lines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `line_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qty` int NOT NULL DEFAULT '0',
  `size` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `glass_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_order_lines_order` (`order_id`),
  CONSTRAINT `fk_order_lines_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_lines`
--

LOCK TABLES `order_lines` WRITE;
/*!40000 ALTER TABLE `order_lines` DISABLE KEYS */;
INSERT INTO `order_lines` VALUES (1,1,'25001520',1,NULL,'MAN',NULL,'2025-12-24 12:42:38'),(2,2,'25000715-1',1,NULL,'MANa',NULL,'2025-12-24 13:08:04'),(3,2,'25000715-2',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(4,2,'25000715-3',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(5,2,'25000715-4',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(6,2,'25000715-5',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(7,2,'25000715-6',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(8,2,'25000715-7',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(9,2,'25000715-8',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(10,2,'25000715-9',11,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(11,2,'25000715-10',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(12,2,'25000715-11',1,NULL,'MAN',NULL,'2025-12-24 13:08:04'),(13,3,'25001454-1',1,NULL,'MAN',NULL,'2025-12-25 05:42:41'),(14,4,'25001551-1',1,NULL,'MAN',NULL,'2025-12-25 06:33:45'),(15,5,'25000715-1',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(16,5,'25000715-2',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(17,5,'25000715-3',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(18,5,'25000715-4',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(19,5,'25000715-5',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(20,5,'25000715-6',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(21,5,'25000715-7',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(22,5,'25000715-8',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(23,5,'25000715-9',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(24,5,'25000715-10',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(25,5,'25000715-11',1,NULL,'MAN',NULL,'2025-12-25 06:39:19'),(26,6,'25000715-1',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(27,6,'25000715-2',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(28,6,'25000715-3',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(29,6,'25000715-4',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(30,6,'25000715-5',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(31,6,'25000715-6',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(32,6,'25000715-7',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(33,6,'25000715-8',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(34,6,'25000715-9',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(35,6,'25000715-10',1,NULL,'MAN',NULL,'2025-12-25 06:51:14'),(36,6,'25000715-11',1,NULL,'MAN',NULL,'2025-12-25 06:51:14');
/*!40000 ALTER TABLE `order_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `client` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `prf` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_date` date DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_no` (`order_no`),
  KEY `fk_orders_created_by` (`created_by`),
  CONSTRAINT `fk_orders_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (1,'1520','tes','250001520','2025-12-26','Active',2,'2025-12-24 12:42:37'),(2,'715','tes3','25000715','2025-12-25','Draft',2,'2025-12-24 13:08:04'),(3,'222','test23','2000','2026-01-01','Draft',2,'2025-12-25 05:42:41'),(4,'131','13131','1313','2026-01-02','Active',2,'2025-12-25 06:33:45'),(5,'13','131331','13',NULL,'Active',2,'2025-12-25 06:39:19'),(6,'13131','3131313','131','2434-12-13','Active',2,'2025-12-25 06:51:14');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `piece_events`
--

DROP TABLE IF EXISTS `piece_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `piece_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `piece_id` int NOT NULL,
  `station_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `event_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_events_piece` (`piece_id`),
  KEY `fk_events_station` (`station_id`),
  KEY `fk_events_user` (`user_id`),
  CONSTRAINT `fk_events_piece` FOREIGN KEY (`piece_id`) REFERENCES `glass_pieces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_events_station` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `piece_events`
--

LOCK TABLES `piece_events` WRITE;
/*!40000 ALTER TABLE `piece_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `piece_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stations`
--

DROP TABLE IF EXISTS `stations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stage_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stations`
--

LOCK TABLES `stations` WRITE;
/*!40000 ALTER TABLE `stations` DISABLE KEYS */;
INSERT INTO `stations` VALUES (1,'CUT-01','Cutting',1,1,'2025-12-24 11:19:49'),(2,'GRD-01','Grinding',2,1,'2025-12-24 11:19:49'),(3,'WSH-01','Washing',3,1,'2025-12-24 11:19:49'),(4,'FRN-01','Furnace',4,1,'2025-12-24 11:19:49'),(5,'PCK-01','Packing',5,1,'2025-12-24 11:19:49'),(6,'DLV-01','Delivery',6,1,'2025-12-24 11:19:49');
/*!40000 ALTER TABLE `stations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `station_id` int DEFAULT NULL,
  `home_page` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `fk_users_station` (`station_id`),
  CONSTRAINT `fk_users_station` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6','manager',1,NULL,'dashboard.html','2025-12-24 11:19:49'),(2,'amani','$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6','order_creator',1,2,'import-orders.html','2025-12-24 11:19:49'),(3,'ahmed','$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6','station',1,1,'station.html','2025-12-24 11:19:49'),(4,'delivery','$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6','station',1,6,'station.html','2025-12-24 11:19:49'),(5,'ziad','$2a$10$C5saCtOPd8R9Rxtxp2vFz.mLSVRmx2B4hed1GAXOl2oRXd4jPgyc6','planner',1,NULL,'activation.html','2025-12-25 07:21:31');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'glass_tracking'
--
/*!50003 DROP PROCEDURE IF EXISTS `sp_mark_broken` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_mark_broken`(
  IN p_piece_code VARCHAR(80),
  IN p_station_name VARCHAR(60),
  IN p_user_id INT,
  IN p_notes VARCHAR(255)
)
BEGIN
  DECLARE v_piece_id INT;
  DECLARE v_station_id INT;
  DECLARE v_current_station_id INT;

  START TRANSACTION;

  SELECT station_id INTO v_station_id
  FROM stations
  WHERE name = p_station_name AND is_active = 1
  LIMIT 1;

  IF v_station_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Station not found/inactive';
  END IF;

  SELECT piece_id, current_station_id
    INTO v_piece_id, v_current_station_id
  FROM glass_pieces
  WHERE piece_code = p_piece_code
  FOR UPDATE;

  IF v_piece_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Piece not found';
  END IF;

  IF v_current_station_id <> v_station_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Piece is not at this station';
  END IF;

  INSERT INTO piece_events (piece_id, station_id, user_id, event_type, notes)
  VALUES (v_piece_id, v_station_id, p_user_id, 'broken', p_notes);

  UPDATE glass_pieces
  SET piece_status = 'broken'
  WHERE piece_id = v_piece_id;

  COMMIT;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_move_next` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_move_next`(
  IN p_piece_code VARCHAR(80),
  IN p_user_id INT,
  IN p_notes VARCHAR(255)
)
BEGIN
  DECLARE v_piece_id INT;
  DECLARE v_order_id INT;
  DECLARE v_current_station_id INT;
  DECLARE v_current_step_no INT;
  DECLARE v_next_station_id INT;

  START TRANSACTION;

  SELECT piece_id, order_id, current_station_id
    INTO v_piece_id, v_order_id, v_current_station_id
  FROM glass_pieces
  WHERE piece_code = p_piece_code
  FOR UPDATE;

  IF v_piece_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Piece not found';
  END IF;

  IF v_current_station_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Piece has no current station';
  END IF;

  -- هات رقم خطوة المحطة الحالية حسب workflow تبع نفس الـOrder
  SELECT step_no
    INTO v_current_step_no
  FROM order_workflow_steps
  WHERE order_id = v_order_id
    AND station_id = v_current_station_id
  LIMIT 1;

  IF v_current_step_no IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This station is not in the workflow for this order';
  END IF;

  -- المحطة التالية حسب step_no
  SELECT station_id
    INTO v_next_station_id
  FROM order_workflow_steps
  WHERE order_id = v_order_id
    AND step_no = v_current_step_no + 1
  LIMIT 1;

  -- event
  INSERT INTO piece_events (piece_id, station_id, user_id, event_type, notes)
  VALUES (v_piece_id, v_current_station_id, p_user_id, 'move_next', p_notes);

  -- تحديث القطعة
  IF v_next_station_id IS NULL THEN
    UPDATE glass_pieces
    SET piece_status = 'completed',
        current_station_id = NULL
    WHERE piece_id = v_piece_id;
  ELSE
    UPDATE glass_pieces
    SET piece_status = 'in_process',
        current_station_id = v_next_station_id
    WHERE piece_id = v_piece_id;
  END IF;

  COMMIT;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-25 11:12:19

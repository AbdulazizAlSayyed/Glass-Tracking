CREATE DATABASE  IF NOT EXISTS `glass_tracking` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `glass_tracking`;
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
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-25 11:08:33

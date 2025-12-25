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

-- Dump completed on 2025-12-25 11:11:43

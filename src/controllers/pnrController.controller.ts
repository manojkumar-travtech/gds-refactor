import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import PnrService from "../services/pnrService.service";

export class PnrController {
  private pnrService: PnrService;

  constructor() {
    this.pnrService = new PnrService();
  }

  /**
   * Store PNR details
   * POST /api/pnr
   */
  storePnrDetails = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { pnrNumber, pnrDetails, queueNumber } = req.body;

      // Validate required fields
      if (!pnrNumber || !queueNumber) {
        res.status(400).json({
          success: false,
          error:
            "Missing required fields: pnrNumber and queueNumber are required",
        });
        return;
      }

      logger.info("Storing PNR details", { pnrNumber, queueNumber });

      const pnrId = await this.pnrService.storePnrDetails(
        pnrNumber,
        pnrDetails,
        queueNumber,
      );

      if (pnrId) {
        res.status(201).json({
          success: true,
          data: {
            pnrId,
            pnrNumber,
            message: "PNR details stored successfully",
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: "Failed to store PNR details",
        });
      }
    } catch (error) {
      logger.error("Error in storePnrDetails controller", {
        error: error instanceof Error ? error.message : error,
      });
      next(error);
    }
  };


  getPnrDetails = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { pnrNumber } = req.params;

      if (!pnrNumber) {
        res.status(400).json({
          success: false,
          error: "PNR number is required",
        });
        return;
      }

      // TODO: Implement getPnrDetails in service
      logger.info("Getting PNR details", { pnrNumber });

      res.status(200).json({
        success: true,
        data: {
          message: "Get PNR details endpoint - to be implemented",
        },
      });
    } catch (error) {
      logger.error("Error in getPnrDetails controller", {
        error: error instanceof Error ? error.message : error,
      });
      next(error);
    }
  };
}

import logging
from flask import Blueprint, jsonify
from models import db, Object, ObjectType
from sqlalchemy import func

logger = logging.getLogger(__name__)
stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint
    ---
    tags:
      - Search & Stats
    summary: Hälsostatus för API och databas
    responses:
      200:
        description: API och databas är igång
        schema:
          type: object
          properties:
            status:
              type: string
              example: healthy
            message:
              type: string
      500:
        description: Databasanslutning misslyckades
        schema:
          type: object
          properties:
            status:
              type: string
              example: unhealthy
            message:
              type: string
    """
    try:
        # Test database connection
        db.session.execute(db.text('SELECT 1'))
        return jsonify({
            'status': 'healthy',
            'message': 'API is running and database is connected'
        }), 200
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'message': 'Database connection failed'
        }), 500

@stats_bp.route('/stats', methods=['GET'])
def get_stats():
    """Get statistics about the object-based system
    ---
    tags:
      - Search & Stats
    summary: Hämta objektstatistik
    responses:
      200:
        description: Statistik över objekt per typ
        schema:
          type: object
          properties:
            total_objects:
              type: integer
              description: Totalt antal objekt
            objects_by_type:
              type: object
              additionalProperties:
                type: integer
              description: Antal objekt per objekttyp (nyckel = typnamn)
            recent_objects:
              type: array
              description: De 10 senast skapade objekten
              items:
                $ref: '#/definitions/Object'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
    try:
        # Total object count
        total_objects = Object.query.count()
        
        # Get all object types first
        all_types = ObjectType.query.all()
        
        # Objects by type - initialize all types with 0
        objects_by_type = {ot.name: 0 for ot in all_types}
        
        # Get actual counts
        type_counts = db.session.query(
            ObjectType.name,
            func.count(Object.id)
        ).join(Object, Object.object_type_id == ObjectType.id)\
         .group_by(ObjectType.name).all()
        
        # Update with actual counts
        for name, count in type_counts:
            objects_by_type[name] = count
        
        # Recent objects
        recent_objects = Object.query.order_by(Object.created_at.desc()).limit(10).all()
        
        return jsonify({
            'total_objects': total_objects,
            'objects_by_type': objects_by_type,
            'recent_objects': [obj.to_dict(include_data=True) for obj in recent_objects]
        }), 200
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        return jsonify({'error': 'Failed to get statistics'}), 500

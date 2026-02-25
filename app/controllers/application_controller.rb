class ApplicationController < ActionController::Base
    before_action :configure_permitted_parameters, if: :devise_controller?

  protected

  def configure_permitted_parameters
    devise_parameter_sanitizer.permit(:sign_up, keys: [:pseudo, :avatar])
    devise_parameter_sanitizer.permit(:account_update, keys: [:pseudo, :avatar])
  end

  def current_or_guest_user
  current_user || guest_user
  end

  def guest_user
    guest_id = session[:guest_user_id]
    if guest_id
      User.find_by(id: guest_id)
    else
      user = User.create!(
      guest: true,
      email: "guest_#{SecureRandom.hex(8)}@guest.com",
      password: SecureRandom.hex(16),
      pseudo: "Guest_#{SecureRandom.hex(4)}"
    )
    session[:guest_user_id] = user.id
    user
    end
  end
end
